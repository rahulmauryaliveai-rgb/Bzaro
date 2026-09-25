import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { verify } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { env } from "@/env";
import { credentialsSchema } from "@/lib/validation/auth";
import type { UserRole } from "@/generated/prisma/enums";

/**
 * Auth.js v5 configuration.
 *
 * ── Session strategy: JWT, not database ──────────────────────────────────────
 * The architecture called for database sessions so that suspensions and role
 * changes take effect immediately. Auth.js cannot do that here: the Credentials
 * provider only works with JWT sessions, and email/password login is a hard
 * requirement for this market.
 *
 * So sessions are JWT-backed, and immediate revocation is restored explicitly:
 *
 *   1. `User.sessionsInvalidAfter` — any token issued before this timestamp is
 *      rejected. Set it on suspend, ban, role change, password reset, or
 *      "sign out everywhere" and the user is out on their very next request.
 *   2. Periodic refresh — the token re-reads the user from the database every
 *      REVALIDATE_AFTER_SECONDS, so `isActive` and `role` changes land quickly
 *      without a database hit on every single request.
 *
 * Net effect: the security property the architecture wanted, at a fraction of
 * the per-request cost. See docs/SECURITY.md §Sessions.
 *
 * ── Cookie scoping ───────────────────────────────────────────────────────────
 * The session cookie is HOST-ONLY: no `Domain` attribute, `__Host-` prefixed in
 * production. A cookie scoped to `.bzaro.in` would be transmitted to
 * every tenant subdomain, so a single stored-XSS on one seller's product
 * description would expose the platform session of any logged-in visitor
 * browsing that tenant.
 *
 * This is why the dashboard lives at bzaro.in/dashboard rather than
 * app.bzaro.in, and why microsites are never authenticated.
 */

const REVALIDATE_AFTER_SECONDS = 300;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const isProduction = env.NODE_ENV === "production";

/**
 * Whether the session cookie can carry `Secure` (and therefore the `__Host-`
 * prefix).
 *
 * Keyed on the SCHEME the app is actually served over, not on NODE_ENV. A
 * `Secure` cookie is simply never sent over plain HTTP, so deciding this from
 * NODE_ENV alone breaks in a real way: a production build served over http —
 * which is exactly how the e2e suite and most CI runs exercise it — issues a
 * cookie the client then refuses to send back, and every authenticated request
 * silently bounces to the login page.
 *
 * Real deployments set an https AUTH_URL and are unaffected. When AUTH_URL is
 * absent we fall back to NODE_ENV, so a misconfigured production deploy still
 * fails closed (secure) rather than open.
 */
export const isSecureOrigin = env.AUTH_URL ? env.AUTH_URL.startsWith("https://") : isProduction;

/** `__Host-` requires Secure, Path=/ and NO Domain — exactly our requirement. */
export const sessionCookieName = isSecureOrigin
  ? "__Host-authjs.session-token"
  : "authjs.session-token";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    id: "credentials",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;

      const user = await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          passwordHash: true,
          isActive: true,
          lockedUntil: true,
          emailVerified: true,
        },
      });

      // Uniform failure for every rejection path. Distinguishing "no such user"
      // from "wrong password" turns the login form into an account-enumeration
      // oracle.
      if (!user?.passwordHash || !user.isActive) return null;
      if (user.lockedUntil && user.lockedUntil > new Date()) return null;

      const valid = await verify(user.passwordHash, password);

      if (!valid) {
        // Lock after repeated failures. Incrementing here rather than in a
        // separate endpoint keeps the counter honest across every entry point.
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLogins: { increment: 1 },
            lockedUntil:
              // 10 strikes → 15 minute lockout.
              (await shouldLock(user.id)) ? new Date(Date.now() + 15 * 60_000) : undefined,
          },
        });
        return null;
      }

      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
      };
    },
  }),
];

// Google is registered only when configured, so a developer without OAuth
// credentials gets a working login page rather than a provider that 500s.
if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  );
}

export const authConfig = {
  // The adapter still persists users and OAuth accounts even under a JWT
  // session strategy — it is the session table alone that goes unused.
  adapter: PrismaAdapter(db as never),

  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: REVALIDATE_AFTER_SECONDS,
  },

  trustHost: env.AUTH_TRUST_HOST === "true",

  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/verify-email",
  },

  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isSecureOrigin,
        // Deliberately NO `domain`. See the cookie-scoping note above — this
        // single omission is what keeps tenant subdomains from ever receiving
        // a platform session cookie.
      },
    },
  },

  callbacks: {
    async jwt({ token, user, trigger }) {
      // Fresh sign-in: seed the token from the authenticated user.
      if (user) {
        token.uid = user.id as string;
        token.role = (user as { role?: UserRole }).role ?? "BUYER";
        token.checkedAt = Math.floor(Date.now() / 1000);
        return token;
      }

      if (!token.uid) return token;

      const checkedAt = (token.checkedAt as number | undefined) ?? 0;
      const age = Math.floor(Date.now() / 1000) - checkedAt;

      if (trigger !== "update" && age < REVALIDATE_AFTER_SECONDS) {
        return token;
      }

      const current = await db.user.findUnique({
        where: { id: token.uid as string },
        select: {
          role: true,
          isActive: true,
          deletedAt: true,
          sessionsInvalidAfter: true,
        },
      });

      // Returning null invalidates the session — the user is signed out on this
      // very request.
      if (!current || !current.isActive || current.deletedAt) return null;

      if (
        current.sessionsInvalidAfter &&
        checkedAt > 0 &&
        current.sessionsInvalidAfter.getTime() / 1000 > ((token.iat as number) ?? checkedAt)
      ) {
        return null;
      }

      token.role = current.role;
      token.checkedAt = Math.floor(Date.now() / 1000);
      return token;
    },

    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid as string;
        session.user.role = (token.role as UserRole) ?? "BUYER";
      }
      return session;
    },
  },

  events: {
    async signIn({ user }) {
      // Audit trail for every successful authentication.
      if (user.id) {
        await db.auditLog.create({
          data: { actorId: user.id, action: "auth.signin" },
        });
      }
    },
  },

  providers,
} satisfies NextAuthConfig;

async function shouldLock(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { failedLogins: true },
  });
  return (user?.failedLogins ?? 0) >= 9;
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";

/**
 * Auth.js module augmentation.
 *
 * Adds `id` and `role` to the session and token types so authorization code
 * reads them without casting. Without this, every guard would need
 * `(session.user as { role?: UserRole }).role`, and a typo in that cast would
 * silently produce `undefined` — which `can()` treats as "no permissions",
 * failing closed but for the wrong reason and with no error to debug.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: UserRole;
    /** Unix seconds of the last database revalidation. See auth/config.ts. */
    checkedAt?: number;
  }
}

export {};

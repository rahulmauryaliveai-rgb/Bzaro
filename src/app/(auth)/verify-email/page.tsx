import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmail } from "@/server/services/auth.service";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ token?: string }> };

/**
 * Email confirmation.
 *
 * Consuming the token is a WRITE, performed here on a GET request — which is
 * normally the wrong shape. It is correct in this one case because the link
 * arrives in an email and must work by being clicked: there is no opportunity
 * to POST. The token is single-use and its hash is deleted on consumption, so
 * a prefetching mail client can burn the link but cannot cause a second effect.
 */
export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Panel title="Check your inbox">
        <p className="text-sm text-neutral-600">
          We&rsquo;ve sent you a confirmation link. Open it to finish setting up your account.
        </p>
      </Panel>
    );
  }

  const result = await verifyEmail(token);

  if (result.ok) {
    return (
      <Panel title={result.alreadyVerified ? "Already confirmed" : "Email confirmed"}>
        <p className="text-sm text-neutral-600">
          {result.alreadyVerified
            ? "This address was already confirmed."
            : "Thanks — your email address is confirmed."}
        </p>
        <Link
          href="/login"
          className="mt-5 block w-full rounded-md bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white"
        >
          Sign in
        </Link>
      </Panel>
    );
  }

  return (
    <Panel title="Link not valid">
      <p className="text-sm text-neutral-600">
        {result.reason === "expired"
          ? "That confirmation link has expired."
          : "That confirmation link is not valid or has already been used."}
      </p>
      <p className="mt-3 text-sm text-neutral-600">
        <Link href="/login" className="underline underline-offset-2">
          Sign in
        </Link>{" "}
        to request a new one.
      </p>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

import type { Metadata } from "next";
import { VerifyPhoneForm } from "@/components/dashboard/VerifyPhoneForm";
import { requireSeller, getSessionUser } from "@/lib/auth/guards";
import { getAccountSettings } from "@/server/services/seller.service";
import { ChangePasswordForm } from "@/components/dashboard/AccountForms";
import { signOutEverywhereAction } from "@/server/actions/account";
import { signOutAction } from "@/server/actions/auth";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false, follow: false },
};

const STATUS_COPY: Record<string, { label: string; detail: string }> = {
  DRAFT: {
    label: "Draft",
    detail: "Your business has not been submitted for verification yet.",
  },
  PENDING_VERIFICATION: {
    label: "Awaiting verification",
    detail:
      "We're reviewing your business. Your website address is reserved but not publicly reachable until this completes — usually within a working day.",
  },
  VERIFIED: {
    label: "Verified",
    detail: "Your business is verified and your website is publicly reachable.",
  },
  REJECTED: {
    label: "Not verified",
    detail: "We couldn't verify your business. Check your email for what to fix.",
  },
  SUSPENDED: {
    label: "Suspended",
    detail: "Your website is offline. Contact support for details.",
  },
  BANNED: { label: "Closed", detail: "This account is closed." },
};

export default async function AccountSettingsPage() {
  const scope = await requireSeller();
  const user = await getSessionUser();

  const { seller, account } = await getAccountSettings(scope.userId, scope.sellerId);

  const status = STATUS_COPY[seller?.status ?? "DRAFT"];

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          Verification
        </h2>
        <p className="mt-2 font-medium">{status?.label}</p>
        <p className="mt-1 text-sm text-neutral-600">{status?.detail}</p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          Sign-in details
        </h2>

        <dl className="space-y-3 text-sm">
          <Row label="Name" value={account?.name ?? user?.name ?? "—"} />
          <Row
            label="Email"
            value={account?.email ?? "—"}
            badge={account?.emailVerified ? "Verified" : "Unverified"}
            warn={!account?.emailVerified}
          />
          <Row
            label="Phone"
            value={account?.phone ?? "Not set"}
            badge={account?.phoneVerified ? "Verified" : "Unverified"}
            warn={!account?.phoneVerified}
          />
        </dl>

        {/*
          Phone verification is a D2 requirement, so an unverified phone is
          actively blocking this seller's site from being indexed. Saying so
          here — rather than only on the dashboard checklist — puts the
          explanation next to the field it concerns.
        */}
        {!account?.phoneVerified ? (
          <>
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Your phone is not verified, which keeps your website out of search results. Verify it
              with a one-time code below.
            </p>
            <VerifyPhoneForm defaultPhone={account?.phone ?? ""} />
          </>
        ) : null}
      </section>

      {account?.hasPassword ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Password
          </h2>
          <ChangePasswordForm />
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          Sessions
        </h2>

        <div className="flex flex-wrap gap-2">
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            >
              Sign out
            </button>
          </form>

          <form action={signOutEverywhereAction}>
            <button
              type="submit"
              className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Sign out everywhere
            </button>
          </form>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          Sign out everywhere ends every session on every device immediately. Use it if you think
          someone else has access to your account.
        </p>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  badge,
  warn,
}: {
  label: string;
  value: string;
  badge?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <dt className="w-24 shrink-0 text-neutral-500">{label}</dt>
      <dd className="flex items-center gap-2">
        <span>{value}</span>
        {badge ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              warn ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-800"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

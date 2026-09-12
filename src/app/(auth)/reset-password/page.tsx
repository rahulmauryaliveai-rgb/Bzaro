import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6">
        <h1 className="mb-2 text-lg font-semibold tracking-tight">Link not valid</h1>
        <p className="text-sm text-neutral-600">
          That reset link is missing information.{" "}
          <Link href="/forgot-password" className="underline underline-offset-2">
            Request a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 text-sm text-neutral-600">You&rsquo;ll be signed out everywhere else.</p>
      <ResetPasswordForm token={token} />
    </div>
  );
}

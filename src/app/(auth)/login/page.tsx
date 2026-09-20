import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/AuthForms";
import { getSessionUser, homeFor } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  // Already signed in: send them on rather than showing a form that will
  // bounce them straight back.
  const user = await getSessionUser();
  if (user) redirect(next && next.startsWith("/") ? next : homeFor(user.role));

  return (
    <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Sign in</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Manage your business profile, catalogue and enquiries.
      </p>
      <LoginForm next={next} />
    </div>
  );
}

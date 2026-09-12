import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Reset your password</h1>
      <p className="mb-6 text-sm text-neutral-600">
        We&rsquo;ll email you a link to choose a new one.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}

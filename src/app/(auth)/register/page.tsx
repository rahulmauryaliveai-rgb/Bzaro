import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/AuthForms";
import { Stepper } from "@/components/onboarding/Stepper";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: true, follow: true },
};

/** Onboarding step 1 of 4: the person. Steps 2–4 describe the business. */
export default function RegisterPage() {
  return (
    <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6">
      <Stepper current="ACCOUNT" />
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-neutral-600">
        List your business, get a website on your own address, and receive buyer requirements.
      </p>
      <RegisterForm />
    </div>
  );
}

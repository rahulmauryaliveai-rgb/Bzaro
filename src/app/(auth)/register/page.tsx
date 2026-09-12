import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: true, follow: true },
};

export default function RegisterPage() {
  return (
    <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Create an account</h1>
      <p className="mb-6 text-sm text-neutral-600">
        List your business and get a website on your own address.
      </p>
      <RegisterForm />
    </div>
  );
}

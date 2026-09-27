"use client";

import { useActionState } from "react";
import { requestCustomDomainAction, type DomainFormState } from "@/server/actions/domain";

const STATUS_COPY: Record<string, string> = {
  PENDING_DNS:
    "Requested — our team will email you the DNS record to add and switch it on, usually within 2 working days.",
  VERIFYING: "Checking your DNS…",
  ACTIVE: "Live — your website opens on this domain.",
  FAILED: "We could not connect this domain. Check the DNS record we sent, or contact support.",
};

export function CustomDomainForm({ domain, status }: { domain: string | null; status: string }) {
  const [state, action, pending] = useActionState<DomainFormState, FormData>(
    requestCustomDomainAction,
    {},
  );
  return (
    <div className="space-y-3">
      {domain && status !== "NONE" ? (
        <p className="text-sm">
          <span className="font-mono font-medium">{domain}</span>
          <span className="ml-2 text-neutral-600">{STATUS_COPY[status] ?? status}</span>
        </p>
      ) : null}
      <form action={action} className="flex flex-wrap gap-2">
        <input
          name="domain"
          required
          defaultValue={domain ?? ""}
          placeholder="www.yourbusiness.com"
          className="min-w-64 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          aria-label="Your domain"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-60"
        >
          {pending ? "Saving…" : domain ? "Change domain" : "Connect domain"}
        </button>
      </form>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.ok ? (
        <p role="status" className="text-sm text-green-700">
          Saved. We will email you the DNS record to add.
        </p>
      ) : null}
    </div>
  );
}

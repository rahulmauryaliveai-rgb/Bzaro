"use client";

import { updateEnquiryStatusAction } from "@/server/actions/enquiry-status";

/**
 * Status control for one enquiry.
 *
 * A real form posting to a Server Action, so it works without JavaScript. The
 * select auto-submits when scripting is available; the noscript button covers
 * the case where it is not.
 */

const OPTIONS = [
  { value: "VIEWED", label: "Viewed" },
  { value: "RESPONDED", label: "Responded" },
  { value: "CONVERTED", label: "Won" },
  { value: "CLOSED", label: "Closed" },
  { value: "SPAM", label: "Mark as spam" },
] as const;

export function EnquiryStatusControl({ enquiryId, status }: { enquiryId: string; status: string }) {
  return (
    <form action={updateEnquiryStatusAction} className="flex items-center gap-2">
      <input type="hidden" name="enquiryId" value={enquiryId} />

      <label htmlFor={`status-${enquiryId}`} className="sr-only">
        Enquiry status
      </label>

      <select
        id={`status-${enquiryId}`}
        name="status"
        defaultValue={status === "NEW" ? "VIEWED" : status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <noscript>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
        >
          Update
        </button>
      </noscript>
    </form>
  );
}

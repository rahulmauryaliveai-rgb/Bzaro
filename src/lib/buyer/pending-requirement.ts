import type { ContactIntentKind, ContactTarget } from "@/components/buyer/ContactIntentModal";

/**
 * A requirement the buyer filled in but could not send because they were not
 * signed in yet.
 *
 * Email sign-up happens inside the modal, so the in-memory draft survives it.
 * "Continue with Google" leaves bzaro.in for accounts.google.com and comes back
 * on a fresh page load, which wipes React state — so the draft is also kept in
 * sessionStorage (this tab only, cleared once sent) and offered back after the
 * phone step as a pre-filled form. The buyer presses Send once more: consent to
 * share the requirement is given by that click, never assumed.
 *
 * Browser-only. Every access is guarded: storage can be disabled or full.
 */

const KEY = "bzaro:pending-requirement";
/** Older than this and the buyer has moved on; don't resurrect it. */
const MAX_AGE_MS = 60 * 60 * 1000;

export type PendingRequirement = {
  v: 1;
  savedAt: number;
  intent: ContactIntentKind;
  target: ContactTarget;
  fields: Record<string, string>;
};

export function savePendingRequirement(
  formData: FormData,
  target: ContactTarget,
  intent: ContactIntentKind,
): void {
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    // The honeypot and anything that is not plain text stay out.
    if (key !== "website" && typeof value === "string") fields[key] = value;
  });
  const record: PendingRequirement = { v: 1, savedAt: Date.now(), intent, target, fields };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable: the Google path just falls back to an empty form.
  }
}

export function loadPendingRequirement(): PendingRequirement | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as PendingRequirement;
    if (record?.v !== 1 || Date.now() - record.savedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function clearPendingRequirement(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

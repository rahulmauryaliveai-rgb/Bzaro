import "server-only";
import { env } from "@/env";
import { ConsoleLeadNotifier } from "@/lib/notify/console";
import type { LeadNotifier } from "@/lib/notify/types";

export type { LeadNotification, LeadNotifier, NotifyResult } from "@/lib/notify/types";

/**
 * LeadNotifier factory. Mirrors src/lib/mail/index.ts.
 *
 * The WhatsApp Cloud API adapter (later phase) is selected here when
 * WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set. Until then,
 * and in any environment without them, the console notifier runs — and in
 * production says so loudly, since sellers will otherwise wonder why their
 * "WhatsApp alerts" only show up in the dashboard.
 */
function createNotifier(): LeadNotifier {
  if (env.NODE_ENV === "production") {
    console.error(
      "[notify] No lead notifier configured in production. " +
        "Sellers receive leads in the dashboard only. Configure WHATSAPP_* to fix.",
    );
  }
  return new ConsoleLeadNotifier();
}

const globalForNotify = globalThis as unknown as { leadNotifier?: LeadNotifier };

export const leadNotifier: LeadNotifier = globalForNotify.leadNotifier ?? createNotifier();

if (env.NODE_ENV !== "production") {
  globalForNotify.leadNotifier = leadNotifier;
}

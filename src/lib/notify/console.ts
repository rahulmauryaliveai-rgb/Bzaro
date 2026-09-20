import type { LeadNotification, LeadNotifier, NotifyResult } from "@/lib/notify/types";

/** Development notifier: prints the message that WhatsApp would carry. */
export class ConsoleLeadNotifier implements LeadNotifier {
  readonly name = "console";

  async notify(n: LeadNotification): Promise<NotifyResult> {
    const divider = "─".repeat(72);
    console.warn(
      [
        "",
        divider,
        `💬  ${n.leadType} lead → ${n.sellerName} (${n.to ?? "no WhatsApp"})`,
        divider,
        n.summary,
        `    ${n.dashboardUrl}`,
        divider,
        "",
      ].join("\n"),
    );
    return { ok: true };
  }
}

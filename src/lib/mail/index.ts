import "server-only";
import { env } from "@/env";

/**
 * Transactional email.
 *
 * Behind a provider interface (D6's rule applied to mail): no vendor SDK is
 * imported outside this module, so swapping Resend for SES is one file.
 *
 * Resend is called over plain `fetch` rather than through its SDK — the API is
 * three fields and a POST, and a dependency that exists to save ten lines is a
 * dependency that has to be audited and upgraded forever.
 *
 * ── Failure policy ───────────────────────────────────────────────────────────
 * `send()` never throws. A registration must not fail because the mail provider
 * is having a bad afternoon: the user account is already created, and a
 * verification email can be re-requested. Callers get a boolean so they can
 * tell the user "check your inbox" versus "we couldn't send that, try again".
 *
 * Delivery failures are logged loudly, because silent email loss is the kind of
 * bug that is only discovered through support tickets.
 */

export type MailMessage = {
  to: string;
  subject: string;
  /** Plain text. Always provided — some clients and most spam filters want it. */
  text: string;
  html?: string;
};

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<boolean>;
}

/**
 * Development provider: prints the message, including any links, to the server
 * console. That is deliberate — during local development the fastest possible
 * verification loop is copying the link out of the terminal.
 */
class ConsoleMailProvider implements MailProvider {
  readonly name = "console";

  async send(message: MailMessage): Promise<boolean> {
    const divider = "─".repeat(72);
    console.warn(
      [
        "",
        divider,
        `📧  ${message.subject}`,
        `    to: ${message.to}`,
        divider,
        message.text,
        divider,
        "",
      ].join("\n"),
    );
    return true;
  }
}

class ResendMailProvider implements MailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<boolean> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });

      if (!response.ok) {
        // Body, not just status: Resend explains domain-verification and
        // rate-limit rejections in the payload, and those are the two that
        // actually happen.
        const body = await response.text().catch(() => "");
        console.error(`[mail] resend rejected (${response.status}): ${body.slice(0, 500)}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error("[mail] resend request failed:", error);
      return false;
    }
  }
}

function createProvider(): MailProvider {
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    return new ResendMailProvider(env.RESEND_API_KEY, env.MAIL_FROM);
  }

  if (env.NODE_ENV === "production") {
    // Loud, but not fatal. A platform that cannot send email is badly degraded
    // — no verification, no password reset, no enquiry notifications — but
    // taking the whole site down over it would be worse.
    console.error(
      "[mail] No mail provider configured in production. " +
        "Set RESEND_API_KEY and MAIL_FROM. Falling back to console logging.",
    );
  }

  return new ConsoleMailProvider();
}

const globalForMail = globalThis as unknown as { mailProvider?: MailProvider };

export const mailer: MailProvider = globalForMail.mailProvider ?? createProvider();

if (env.NODE_ENV !== "production") {
  globalForMail.mailProvider = mailer;
}

import type { OtpPurpose } from "@/generated/prisma/enums";

/**
 * OTP delivery provider.
 *
 * Same contract as MailProvider: the platform hands over a phone and a code,
 * the provider gets it there. Nothing about SMS, WhatsApp or any vendor SDK
 * leaks outside src/lib/otp — swapping MSG91 for the WhatsApp Cloud API is one
 * file.
 *
 * `send()` never throws. The challenge row is already written; a delivery
 * failure is reported as `false` so the caller can tell the buyer to retry
 * rather than letting them wait for a code that is not coming.
 */
export type OtpMessage = {
  /** E.164. Already normalised by src/lib/buyer/phone.ts. */
  phone: string;
  /** The plaintext code. Never logged by a production provider. */
  code: string;
  purpose: OtpPurpose;
  /** Minutes until the code expires, for the message copy. */
  ttlMinutes: number;
};

export interface OtpProvider {
  readonly name: string;
  send(message: OtpMessage): Promise<boolean>;
}

import "server-only";
import { env } from "@/env";
import { ConsoleOtpProvider } from "@/lib/otp/console";
import type { OtpProvider } from "@/lib/otp/types";

export type { OtpMessage, OtpProvider } from "@/lib/otp/types";

/**
 * OTP provider factory. Mirrors src/lib/mail/index.ts.
 *
 * Today there is one implementation. The WhatsApp Cloud API adapter (later
 * phase) slots in here behind `WHATSAPP_ACCESS_TOKEN`, and an SMS fallback
 * can be added the same way without touching any caller.
 */
function createProvider(): OtpProvider {
  if (env.NODE_ENV === "production") {
    console.error(
      "[otp] No OTP provider configured in production. " +
        "Codes are being printed to the server log. Configure WHATSAPP_* to fix.",
    );
  }
  return new ConsoleOtpProvider();
}

const globalForOtp = globalThis as unknown as { otpProvider?: OtpProvider };

export const otpProvider: OtpProvider = globalForOtp.otpProvider ?? createProvider();

if (env.NODE_ENV !== "production") {
  globalForOtp.otpProvider = otpProvider;
}

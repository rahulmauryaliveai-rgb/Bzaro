import type { OtpMessage, OtpProvider } from "@/lib/otp/types";

/**
 * Development provider: prints the code to the server console.
 *
 * Deliberate, like ConsoleMailProvider — during local development the fastest
 * verification loop is reading the code out of the terminal. In production
 * this provider is only ever reached when nothing else is configured, and
 * src/lib/otp/index.ts logs a loud error when that happens.
 */
export class ConsoleOtpProvider implements OtpProvider {
  readonly name = "console";

  async send(message: OtpMessage): Promise<boolean> {
    const divider = "─".repeat(72);
    console.warn(
      [
        "",
        divider,
        `📱  OTP for ${message.phone}  (${message.purpose})`,
        divider,
        `    code: ${message.code}    expires in ${message.ttlMinutes} min`,
        divider,
        "",
      ].join("\n"),
    );
    return true;
  }
}

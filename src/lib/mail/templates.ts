import { clientEnv } from "@/env.client";
import type { MailMessage } from "@/lib/mail";

/**
 * Transactional email copy.
 *
 * Written the way a person writes: short, direct, no marketing voice. These
 * messages arrive at a moment of friction — someone is trying to get into an
 * account — so the only job is to make the next step obvious.
 *
 * Every message states the expiry and what to do if it wasn't them. Security
 * emails that omit "if this wasn't you" train people to ignore the ones that
 * matter.
 */

const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

export function verificationEmail(params: { to: string; url: string }): MailMessage {
  return {
    to: params.to,
    subject: `Confirm your email for ${platform}`,
    text: [
      `Confirm your email address to finish setting up your ${platform} account.`,
      ``,
      params.url,
      ``,
      `This link expires in 24 hours.`,
      ``,
      `If you didn't create an account, you can ignore this email.`,
    ].join("\n"),
  };
}

/**
 * The buyer's six-digit code. The subject line carries the code itself so it is
 * readable from a notification without opening the mail — the single biggest
 * thing that makes an emailed OTP feel as quick as an SMS.
 */
export function emailOtpEmail(params: {
  to: string;
  code: string;
  purpose: "SIGNUP" | "RESET_PASSWORD";
  ttlMinutes: number;
}): MailMessage {
  const reason =
    params.purpose === "SIGNUP"
      ? `Confirm your email to finish setting up your ${platform} account.`
      : `Use this code to choose a new ${platform} password.`;

  return {
    to: params.to,
    subject: `Your ${platform} verification code: ${params.code}`,
    text: [
      reason,
      ``,
      params.code,
      ``,
      `This code expires in ${params.ttlMinutes} minutes and can only be used once.`,
      ``,
      params.purpose === "SIGNUP"
        ? `If you didn't create an account, you can ignore this email.`
        : `If you didn't ask to reset your password, you can ignore this email — your password will not change.`,
    ].join("\n"),
  };
}

export function passwordResetEmail(params: { to: string; url: string }): MailMessage {
  return {
    to: params.to,
    subject: `Reset your ${platform} password`,
    text: [
      `Use this link to choose a new password:`,
      ``,
      params.url,
      ``,
      `This link expires in 1 hour and can only be used once.`,
      ``,
      `If you didn't ask to reset your password, you can ignore this email —`,
      `your password will stay as it is.`,
    ].join("\n"),
  };
}

export function passwordChangedEmail(params: { to: string }): MailMessage {
  return {
    to: params.to,
    subject: `Your ${platform} password was changed`,
    text: [
      `Your password was just changed, and you've been signed out everywhere else.`,
      ``,
      `If this wasn't you, reset your password immediately and contact support.`,
    ].join("\n"),
  };
}

export function sellerWelcomeEmail(params: {
  to: string;
  businessName: string;
  siteUrl: string;
  dashboardUrl: string;
}): MailMessage {
  return {
    to: params.to,
    subject: `${params.businessName} is set up on ${platform}`,
    text: [
      `Your business is registered and your website address is reserved:`,
      ``,
      params.siteUrl,
      ``,
      `Your site isn't visible to search engines yet. It becomes eligible once`,
      `your profile is complete — your dashboard shows exactly what's left:`,
      ``,
      params.dashboardUrl,
      ``,
      `That's deliberate: an incomplete site that gets indexed early tends to`,
      `rank badly for a long time afterwards.`,
    ].join("\n"),
  };
}

/** A supplier accepted the buyer's requirement (buyer account, email alerts). */
export function supplierRespondedEmail(params: {
  to: string;
  buyerName: string | null;
  sellerName: string;
  productName: string;
  url: string;
}): MailMessage {
  const greeting = params.buyerName ? `Hi ${params.buyerName.split(" ")[0]},` : "Hi,";
  return {
    to: params.to,
    subject: `${params.sellerName} responded to your requirement for ${params.productName}`,
    text: [
      greeting,
      ``,
      `${params.sellerName} has accepted your requirement for "${params.productName}" on ${platform} and will contact you shortly.`,
      ``,
      `See their details and reach them on WhatsApp or phone:`,
      params.url,
      ``,
      `You can turn these emails off in Profile & settings on ${platform}.`,
    ].join("\n"),
  };
}

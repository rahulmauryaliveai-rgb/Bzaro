import { z } from "zod";

/**
 * Enquiry submission.
 *
 * This is the platform's most valuable data and its most attacked form: a
 * public contact box on thousands of subdomains. Enquiry quality IS the
 * product — a seller whose inbox fills with spam stops trusting the platform
 * faster than one who experiences downtime.
 *
 * Every field is capped. The honeypot and timing fields are part of the schema
 * rather than bolted on at the call site, so they cannot be forgotten by a
 * future form.
 */

export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+]?[\d\s-()]{7,20}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  company: z.string().trim().max(200).optional(),

  message: z
    .string()
    .trim()
    .min(10, "Tell the supplier what you need")
    // 5000 is generous for a genuine enquiry and cheap to store. Unbounded text
    // is a denial-of-service vector, not a feature.
    .max(5000, "Message is too long"),

  quantity: z.coerce.number().int().min(1).max(10_000_000).optional().catch(undefined),

  /**
   * Honeypot. Hidden from humans by CSS, irresistible to naive bots. A filled
   * value is a near-certain bot, so the submission is accepted with a success
   * response and silently discarded — telling the bot it failed just teaches it
   * to try again differently.
   */
  website: z.string().max(200).optional(),

  /**
   * Milliseconds the form was on screen before submission, from a hidden field
   * set at render. Humans take seconds; scripted posts are near-instant.
   */
  elapsedMs: z.coerce.number().int().min(0).max(86_400_000).optional().catch(undefined),

  productId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  serviceId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),

  /** Consent to being contacted — required under India's DPDP Act. */
  consent: z.literal("on", { message: "Please agree to be contacted" }),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;

/** A genuine enquiry needs at least one way to reply. */
export function hasContactMethod(input: { email?: string; phone?: string }): boolean {
  return Boolean(input.email ?? input.phone);
}

/** Minimum time on the form before a submission looks human. */
export const MIN_FORM_ELAPSED_MS = 2_500;

/**
 * Heuristic spam score, 0 (clean) to 1 (certain).
 *
 * Deliberately simple and explainable: every contribution is a rule a human can
 * read, argue with, and tune. A black-box classifier on the enquiry path would
 * be impossible to debug when a seller complains that a real customer never
 * came through.
 *
 * Scoring never blocks on its own — it flags for review. False positives here
 * cost a real lead, which is worse than a spam message getting through.
 */
export function scoreSpam(input: {
  message: string;
  name: string;
  elapsedMs?: number;
  hasHoneypot: boolean;
}): number {
  let score = 0;

  if (input.hasHoneypot) return 1;

  if (input.elapsedMs !== undefined && input.elapsedMs < MIN_FORM_ELAPSED_MS) score += 0.4;

  // Link-stuffing is the single strongest signal in contact-form spam.
  const links = (input.message.match(/https?:\/\//gi) ?? []).length;
  if (links >= 1) score += 0.2;
  if (links >= 3) score += 0.3;

  // ALL CAPS beyond a short exclamation.
  const letters = input.message.replace(/[^a-z]/gi, "");
  if (letters.length > 20) {
    const upper = (input.message.match(/[A-Z]/g) ?? []).length / letters.length;
    if (upper > 0.6) score += 0.2;
  }

  // Classic SEO/crypto spam vocabulary.
  if (/\b(seo services|backlink|crypto|forex|casino|viagra|loan offer)\b/i.test(input.message)) {
    score += 0.4;
  }

  // A "name" containing a URL is never a person.
  if (/https?:\/\/|www\./i.test(input.name)) score += 0.4;

  return Math.min(1, score);
}

/** At or above this, the enquiry is filed as spam rather than delivered. */
export const SPAM_THRESHOLD = 0.7;

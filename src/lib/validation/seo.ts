import { z } from "zod";

/**
 * Admin-written SEO content (D44). Kept deliberately small: a title, a
 * description, an intro, a handful of real buyer questions. Anything longer
 * belongs in a blog article.
 */

export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 170;
export const FAQ_MAX = 10;

export const faqItemSchema = z.object({
  q: z.string().trim().min(5, "Question too short").max(200),
  a: z.string().trim().min(10, "Answer too short").max(1200),
});

export type FaqItem = z.infer<typeof faqItemSchema>;

export const faqsSchema = z.array(faqItemSchema).max(FAQ_MAX);

/** Stored JSON → FAQs; anything malformed renders as no FAQs, never a crash. */
export function parseFaqs(value: unknown): FaqItem[] {
  const parsed = faqsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/**
 * Read `faq_q_0`/`faq_a_0` … pairs from a form. Rows left blank are dropped;
 * a row with only one half filled is an error the admin should see.
 */
export function faqsFromForm(
  formData: FormData,
): { ok: true; faqs: FaqItem[] } | { ok: false; error: string } {
  const faqs: FaqItem[] = [];
  for (let i = 0; i < FAQ_MAX; i++) {
    const q = String(formData.get(`faq_q_${i}`) ?? "").trim();
    const a = String(formData.get(`faq_a_${i}`) ?? "").trim();
    if (!q && !a) continue;
    const parsed = faqItemSchema.safeParse({ q, a });
    if (!parsed.success) {
      return { ok: false, error: `FAQ ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}` };
    }
    faqs.push(parsed.data);
  }
  return { ok: true, faqs };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

export const categorySeoSchema = z.object({
  id: z.string().min(1).max(40),
  metaTitle: optionalText(SEO_TITLE_MAX),
  metaDescription: optionalText(SEO_DESCRIPTION_MAX),
  description: optionalText(4000),
  ogImageUrl: optionalText(500).refine(
    (value) => value === null || /^https:\/\//.test(value),
    "Image must be an https:// URL",
  ),
  noindex: z.boolean(),
});

export type CategorySeoInput = z.infer<typeof categorySeoSchema>;

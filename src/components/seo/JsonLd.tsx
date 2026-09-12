import { serializeJsonLd, type JsonLdObject } from "@/lib/seo/jsonld";

/**
 * Emits a JSON-LD <script> block.
 *
 * The single sanctioned `dangerouslySetInnerHTML` in the codebase — JSON-LD has
 * no other injection point. The payload goes through `serializeJsonLd`, which
 * escapes `<`, `>` and `&` so a seller's business name containing `</script>`
 * cannot break out of the tag.
 *
 * `eslint.config.mjs` exempts this file and `lib/seo/jsonld.ts` by name. Do not
 * copy this pattern anywhere else.
 */

export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

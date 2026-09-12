import type { PrismaClient } from "../../src/generated/prisma/client";
import { defaultThemeTokens } from "../../src/lib/validation/theme";

/**
 * Website templates (decision D7).
 *
 * The `key` must match an entry in src/components/site/templates/registry.ts.
 * A row whose key has no registered component falls back to the default
 * template at render time rather than erroring — a seller should never lose
 * their site because a template was retired.
 */

export async function seedTemplates(prisma: PrismaClient) {
  const definitions = [
    {
      key: "classic",
      name: "Classic",
      description: "A conventional business layout. Clear hierarchy, no surprises.",
      isPremium: false,
      sortOrder: 0,
      defaultTokens: defaultThemeTokens,
    },
    {
      key: "modern",
      name: "Modern",
      description: "Centred, generous whitespace, large type.",
      isPremium: true,
      sortOrder: 1,
      defaultTokens: {
        ...defaultThemeTokens,
        primary: "#1b3a5c",
        accent: "#c2703d",
        headerVariant: "centered" as const,
        heroVariant: "plain" as const,
        radius: "lg" as const,
      },
    },
  ];

  const templates: Record<string, { id: string }> = {};

  for (const template of definitions) {
    const row = await prisma.websiteTemplate.upsert({
      where: { key: template.key },
      create: template,
      update: {
        name: template.name,
        description: template.description,
        isPremium: template.isPremium,
        sortOrder: template.sortOrder,
        defaultTokens: template.defaultTokens,
      },
      select: { id: true, key: true },
    });
    templates[row.key] = { id: row.id };
  }

  return templates;
}

export type SeededTemplates = Awaited<ReturnType<typeof seedTemplates>>;

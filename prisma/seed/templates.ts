import type { PrismaClient } from "../../src/generated/prisma/client";
import { defaultThemeTokens, type ThemeTokens } from "../../src/lib/validation/theme";

/**
 * Website templates (decision D7).
 *
 * The `key` must match an entry in src/components/site/templates/registry.ts.
 * A row whose key has no registered component falls back to the default
 * template at render time rather than erroring — a seller should never lose
 * their site because a template was retired.
 */

export async function seedTemplates(prisma: PrismaClient) {
  // Storefront templates (D33) — each preset is the look the reference theme
  // had, expressed in our validated tokens. Sellers tune colours afterwards.
  const definitions = [
    {
      key: "electro",
      name: "Electro",
      description: "Electronics mega-market: banner + promo tiles, category circles, deal grids.",
      previewImage: "/templates/electro.png",
      isPremium: false,
      sortOrder: 0,
      defaultTokens: {
        ...defaultThemeTokens,
        primary: "#12357a",
        accent: "#e63946",
        background: "#ffffff",
        foreground: "#111827",
        surface: "#f3f4f6",
        border: "#e5e7eb",
        fontPair: "inter" as const,
        radius: "sm" as const,
      },
    },
    {
      key: "medico",
      name: "Medico",
      description:
        "Clean pharmacy / medical supply look: sidebar categories, blue bands, rounded cards.",
      previewImage: "/templates/medico.png",
      isPremium: false,
      sortOrder: 1,
      defaultTokens: {
        ...defaultThemeTokens,
        primary: "#2f6df6",
        accent: "#10b981",
        background: "#ffffff",
        foreground: "#0f172a",
        surface: "#eef3ff",
        border: "#dbe4f5",
        fontPair: "dm-sans" as const,
        radius: "lg" as const,
      },
    },
    {
      key: "autoparts",
      name: "Autoparts",
      description: "Industrial and automotive: dark chrome, orange accents, flash-sale bands.",
      previewImage: "/templates/autoparts.png",
      isPremium: false,
      sortOrder: 2,
      defaultTokens: {
        ...defaultThemeTokens,
        primary: "#111827",
        accent: "#f97316",
        background: "#ffffff",
        foreground: "#111827",
        surface: "#f5f5f4",
        border: "#e7e5e4",
        fontPair: "manrope" as const,
        radius: "sm" as const,
      },
    },
    {
      key: "minimal",
      name: "Minimal",
      description: "Spacious, soft-grey panels, big category cards. For tech and accessories.",
      previewImage: "/templates/minimal.png",
      isPremium: false,
      sortOrder: 3,
      defaultTokens: {
        ...defaultThemeTokens,
        primary: "#1d4ed8",
        accent: "#0ea5e9",
        background: "#ffffff",
        foreground: "#0f172a",
        surface: "#f5f6f8",
        border: "#e5e7eb",
        fontPair: "inter" as const,
        radius: "lg" as const,
      },
    },
    {
      key: "boutique",
      name: "Boutique",
      description:
        "Editorial: full-bleed cover, serif headings, image tiles. Fashion, art, handmade.",
      previewImage: "/templates/boutique.png",
      isPremium: false,
      sortOrder: 4,
      defaultTokens: {
        ...defaultThemeTokens,
        primary: "#1c1917",
        accent: "#b45309",
        background: "#fffdf9",
        foreground: "#1c1917",
        surface: "#f4efe6",
        border: "#e7e0d3",
        fontPair: "lora" as const,
        radius: "none" as const,
      },
    },
    {
      key: "fresh",
      name: "Fresh",
      description: "Greens and cream, rounded, photo-led. Grocery, plants, agri, natural products.",
      previewImage: "/templates/fresh.png",
      isPremium: false,
      sortOrder: 5,
      defaultTokens: {
        ...defaultThemeTokens,
        primary: "#14532d",
        accent: "#f59e0b",
        background: "#fbfaf5",
        foreground: "#14231b",
        surface: "#eaf2e6",
        border: "#d9e4d3",
        fontPair: "manrope" as const,
        radius: "lg" as const,
      },
    },
    {
      key: "classic",
      name: "Classic",
      description: "A conventional business layout. Clear hierarchy, no surprises.",
      previewImage: "/templates/classic.png",
      isPremium: false,
      sortOrder: 6,
      defaultTokens: defaultThemeTokens,
    },
    {
      key: "modern",
      name: "Modern",
      description: "Centred, generous whitespace, large type.",
      previewImage: "/templates/modern.png",
      isPremium: true,
      sortOrder: 7,
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

  const templates: Record<string, { id: string; defaultTokens: ThemeTokens }> = {};

  for (const template of definitions) {
    const row = await prisma.websiteTemplate.upsert({
      where: { key: template.key },
      create: template,
      update: {
        name: template.name,
        description: template.description,
        previewImage: template.previewImage,
        isPremium: template.isPremium,
        sortOrder: template.sortOrder,
        defaultTokens: template.defaultTokens,
      },
      select: { id: true, key: true },
    });
    templates[row.key] = { id: row.id, defaultTokens: template.defaultTokens };
  }

  return templates;
}

export type SeededTemplates = Awaited<ReturnType<typeof seedTemplates>>;

import { z } from "zod";

/**
 * Microsite theme tokens (decision D7).
 *
 * These values are stored as JSON, chosen by sellers, and rendered into CSS
 * custom properties on the microsite's <html> element. That makes them an
 * injection surface: a value like `red; } body { display:none } .x {` would
 * escape the declaration and rewrite the page if it were interpolated blindly.
 *
 * Two defences, both required:
 *   1. This schema — every token is constrained to a strict pattern or a fixed
 *      set. Free-form strings are never accepted.
 *   2. Rendering — tokens are emitted as individual custom properties, never
 *      concatenated into a raw <style> block by string building.
 *
 * Templates are code, not data. Sellers pick a template and tune these tokens;
 * they never supply markup or CSS.
 */

/** #rgb, #rrggbb or #rrggbbaa. Deliberately excludes rgb()/hsl()/var(). */
const hexColor = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    "Must be a hex colour like #1a2b3c",
  );

/** Font choices are an allowlist, not free text — each maps to a loaded face. */
export const FONT_PAIRS = ["inter", "plex", "source", "lora", "manrope", "dm-sans"] as const;

export const RADIUS_SCALE = ["none", "sm", "md", "lg", "full"] as const;
export const DENSITY = ["compact", "comfortable", "spacious"] as const;
export const HEADER_VARIANT = ["minimal", "classic", "centered", "split"] as const;
export const HERO_VARIANT = ["cover", "split", "banner", "plain"] as const;

export const themeTokensSchema = z
  .object({
    /** Primary brand colour: buttons, links, active states. */
    primary: hexColor.default("#0f6a5b"),
    /** Accent for highlights and badges. */
    accent: hexColor.default("#b4541a"),
    /** Page background. */
    background: hexColor.default("#ffffff"),
    /** Body text. */
    foreground: hexColor.default("#14181a"),
    /** Card and panel surfaces. */
    surface: hexColor.default("#f6f7f7"),
    /** Borders and dividers. */
    border: hexColor.default("#dfe4e5"),

    fontPair: z.enum(FONT_PAIRS).default("plex"),
    radius: z.enum(RADIUS_SCALE).default("md"),
    density: z.enum(DENSITY).default("comfortable"),
    headerVariant: z.enum(HEADER_VARIANT).default("classic"),
    heroVariant: z.enum(HERO_VARIANT).default("cover"),

    /** Show the "Powered by" line. Paid plans may switch this off. */
    showPlatformBranding: z.boolean().default(true),
  })
  // Unknown keys are dropped rather than rejected, so adding a token in a later
  // release does not invalidate every row written by an earlier one.
  .strip();

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

/** Default tokens, used when a seller has never customised their site. */
export const defaultThemeTokens: ThemeTokens = themeTokensSchema.parse({});

/**
 * Convert validated tokens into CSS custom properties.
 *
 * Returns a style object for React rather than a CSS string. React escapes
 * style values, and the schema has already constrained every value to a safe
 * pattern — so there is no path here where seller input becomes raw CSS.
 */
export function themeToCssVars(tokens: ThemeTokens): Record<string, string> {
  return {
    "--site-primary": tokens.primary,
    "--site-accent": tokens.accent,
    "--site-background": tokens.background,
    "--site-foreground": tokens.foreground,
    "--site-surface": tokens.surface,
    "--site-border": tokens.border,
    "--site-radius": RADIUS_VALUES[tokens.radius],
    "--site-density": DENSITY_VALUES[tokens.density],
  };
}

const RADIUS_VALUES: Record<(typeof RADIUS_SCALE)[number], string> = {
  none: "0px",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "1rem",
  full: "9999px",
};

const DENSITY_VALUES: Record<(typeof DENSITY)[number], string> = {
  compact: "0.75",
  comfortable: "1",
  spacious: "1.25",
};

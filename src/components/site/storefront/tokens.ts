/**
 * Class fragments for the storefront section library.
 *
 * Every colour comes from the theme's CSS custom properties (set on <html> by
 * the site layout from validated tokens — see src/lib/validation/theme.ts), so
 * one section renders correctly under every template: a template changes the
 * variables and the composition, never the sections' markup.
 *
 * Tailwind v4's `bg-(--var)` shorthand is used throughout; these constants
 * exist so the variable names are typed in one place.
 */

export const T = {
  primaryBg: "bg-(--site-primary) text-white",
  primaryText: "text-(--site-primary)",
  primaryBorder: "border-(--site-primary)",
  accentBg: "bg-(--site-accent) text-white",
  accentText: "text-(--site-accent)",
  surface: "bg-(--site-surface)",
  background: "bg-(--site-background)",
  border: "border-(--site-border)",
  radius: "rounded-(--site-radius)",
  /** Buttons keep a slightly tighter radius than cards on the "full" scale. */
  radiusSm: "rounded-[min(var(--site-radius),0.75rem)]",
} as const;

/** Section container widths. Storefronts are wider than the reading pages. */
export const CONTAINER = "mx-auto w-full max-w-7xl px-4 sm:px-6";

export const BTN_PRIMARY = `inline-flex items-center justify-center gap-2 ${T.primaryBg} ${T.radiusSm} px-5 py-2.5 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90`;
export const BTN_ACCENT = `inline-flex items-center justify-center gap-2 ${T.accentBg} ${T.radiusSm} px-5 py-2.5 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90`;
export const BTN_OUTLINE = `inline-flex items-center justify-center gap-2 border ${T.border} ${T.radiusSm} px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-(--site-surface)`;
export const BTN_WHITE = `inline-flex items-center justify-center gap-2 rounded-[min(var(--site-radius),0.75rem)] bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition-opacity hover:opacity-90`;

/** Truncate a description for a hero standfirst. */
export function excerpt(text: string | null | undefined, max = 180): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

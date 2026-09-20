# Brand assets

The Bzaro logo: a blue "B" wearing a shop awning, the wordmark **Bzaro.in**
with a green "z", a green swoosh, and the tagline *Your Trusted Indian
Marketplace*.

| File | Use | Size |
|---|---|---|
| `public/brand/bzaro-wordmark.png` | Header, sidebars — the default | 720 × 157 |
| `public/brand/bzaro-logo.png` | Large surfaces: auth pages, footer, emails | 960 × 282 |
| `public/brand/bzaro-mark.png` | Tight spaces, avatars | 512 × 512 |
| `src/app/icon.png` | Favicon (Next.js file convention) | 512 × 512 |
| `src/app/apple-icon.png` | iOS home screen, opaque white | 512 × 512 |
| `src/app/(marketplace)/opengraph-image.png` | Link previews for apex pages | 1200 × 630 |

All `public/brand` files and the favicon are **transparent**, so they sit on
the light marketplace header and the dark admin sidebar alike.

Render the logo through `src/components/shared/BrandLogo.tsx`
(`<BrandLogo variant="wordmark" height={32} />`); never `<img>` it by hand, so
the alt text and sizing stay consistent.

## Regenerating

The master is `scripts/brand/bzaro-logo-master.png` (white background). Every
derived file comes from it:

```bash
node scripts/brand/generate.mjs
```

The script knocks out the white background, trims, crops the "B" for the mark
(rectangle measured against the master — re-check it if the master changes)
and composes the OG image. Do not hand-edit the outputs.

Colours, for anything that must match: blue `#1a4d9c` (approx.), green
`#1f9d3f` (approx.) — sampled from the master; a vector source would be
better and should replace the PNG when available.

## Colour theme

Tailwind tokens in `src/app/globals.css` (`@theme`), sampled from the logo:

| Token | Hex | Used for |
|---|---|---|
| `brand-700` | `#0b4a99` | primary buttons, links, prices, the category bar's parent (`brand-900` `#08447a`) |
| `accent-600` | `#1ea44f` | the one conversion colour: "Post requirement", verified badges |
| `brand-50/100` | tints | hero gradient, icon chips, category-chip fills |

Rule of thumb on the marketplace: **blue is navigation, green is conversion.**
Only the lead-creating action ("Post requirement") and trust signals are green,
so it stays meaningful. shadcn's `--primary` and `--ring` follow `brand-700` /
`brand-500`, so dashboard form controls pick up the palette without changes.

The homepage (`src/app/(marketplace)/page.tsx`, sections in
`src/components/marketplace/Home.tsx`) follows the "B2B Wholesale" reference
layout: two-tier header with a dominant search box, two-tone hero headline with
real product imagery, trust strip, image category tiles, "how it works", dark
stats band, seller CTA and FAQ. Every number on it is a live count from
`getPlatformStats()` — no placeholder figures or testimonials.

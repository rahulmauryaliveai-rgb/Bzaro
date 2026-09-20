#!/usr/bin/env node
/**
 * Generates every Bzaro brand asset from the master logo (docs/BRAND.md).
 *
 *   node scripts/brand/generate.mjs
 *
 * Input:  scripts/brand/bzaro-logo-master.png   (white background, 1668 × 624)
 * Output: public/brand/bzaro-logo.png            wordmark + tagline, transparent
 *         public/brand/bzaro-wordmark.png        wordmark only, transparent
 *         public/brand/bzaro-mark.png            the "B" mark, square, transparent
 *         src/app/icon.png                       favicon (Next file convention)
 *         src/app/apple-icon.png                 iOS home-screen icon, opaque
 *         src/app/(marketplace)/opengraph-image.png  1200 × 630 share image
 *
 * The crop rectangles below are measured against the master; regenerate
 * from a new master only after checking them.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = path.resolve(__dirname, "bzaro-logo-master.png");
const OUT = path.resolve("public/brand");
fs.mkdirSync(OUT, { recursive: true });

async function knockOutWhite(input) {
  // Near-white → transparent, with a soft edge so anti-aliased strokes keep
  // their fringe rather than turning into a hard cut-out.
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const min = Math.min(r, g, b);
    if (min >= 235) data[i + 3] = 0;
    else if (min >= 200) data[i + 3] = Math.round(((235 - min) / 35) * 255);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function main() {
  const base = sharp(SRC);
  const meta = await base.metadata();
  process.stdout.write(["source", meta.width, meta.height].join(" ") + String.fromCharCode(10));

  // 1. Full logo, transparent, trimmed, sized for the web (2x of ~240px wide).
  const logo = await knockOutWhite(sharp(SRC));
  const trimmed = await logo.png().toBuffer();
  await sharp(trimmed).trim().resize({ width: 960 }).png().toFile(path.join(OUT, "bzaro-logo.png"));

  // 2. The wordmark without the tagline: crop the top ~70% then trim.
  const wordmarkRegion = {
    left: 0,
    top: 0,
    width: meta.width,
    height: Math.round(meta.height * 0.66),
  };
  const wordmarkBuf = await sharp(trimmed).extract(wordmarkRegion).png().toBuffer();
  await sharp(wordmarkBuf)
    .trim()
    .resize({ width: 720 })
    .png()
    .toFile(path.join(OUT, "bzaro-wordmark.png"));

  // 3. The mark: the "B" with the awning, for favicons. Region measured from
  //    the source: x 100–440, y 70–410.
  const markRaw = await sharp(trimmed)
    .extract({ left: 100, top: 60, width: 325, height: 360 })
    .png()
    .toBuffer();
  const markBuf = await sharp(markRaw).trim().png().toBuffer();
  const mark = sharp(markBuf);
  const m = await mark.metadata();
  const side = Math.max(m.width, m.height) + Math.round(Math.max(m.width, m.height) * 0.18);
  const square = await sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: markBuf,
        left: Math.round((side - m.width) / 2),
        top: Math.round((side - m.height) / 2),
      },
    ])
    .png()
    .toBuffer();
  await sharp(square).resize(512, 512).png().toFile(path.join(OUT, "bzaro-mark.png"));
  await sharp(square).resize(512, 512).png().toFile(path.resolve("src/app/icon.png"));
  // Apple wants an opaque background.
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#ffffff" } })
    .composite([
      { input: await sharp(square).resize(400, 400).png().toBuffer(), left: 56, top: 56 },
    ])
    .png()
    .toFile(path.resolve("src/app/apple-icon.png"));

  // 4. Open Graph: 1200×630, logo centred on white.
  const ogLogo = await sharp(trimmed).trim().resize({ width: 1000 }).png().toBuffer();
  const ogMeta = await sharp(ogLogo).metadata();
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: "#ffffff" } })
    .composite([
      {
        input: ogLogo,
        left: Math.round((1200 - ogMeta.width) / 2),
        top: Math.round((630 - ogMeta.height) / 2),
      },
    ])
    .png()
    .toFile(path.resolve("src/app/(marketplace)/opengraph-image.png"));

  for (const f of [
    "public/brand/bzaro-logo.png",
    "public/brand/bzaro-wordmark.png",
    "public/brand/bzaro-mark.png",
    "src/app/icon.png",
    "src/app/apple-icon.png",
    "src/app/(marketplace)/opengraph-image.png",
  ]) {
    const mm = await sharp(path.resolve(f)).metadata();
    process.stdout.write(
      [f, mm.width + "x" + mm.height, Math.round(fs.statSync(f).size / 1024) + "KB"].join(" ") +
        String.fromCharCode(10),
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

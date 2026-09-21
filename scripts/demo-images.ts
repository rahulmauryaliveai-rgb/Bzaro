/**
 * Fetch real, freely licensed photos for the showcase sellers and the
 * category tiles, so demo data does not look like demo data.
 *
 * Source: Wikimedia Commons — every file there is CC0, CC BY, CC BY-SA or
 * public domain. Searches are cached in scripts/demo-images/candidates.json;
 * only the chosen files are downloaded, cropped with sharp and written as
 * webp. Attribution for every file goes next to the images
 * (ATTRIBUTION.json) — CC BY requires it.
 *
 *   npx tsx scripts/demo-images.ts search       query Commons, cache 8 candidates per key
 *   npx tsx scripts/demo-images.ts candidates   review sheets of every candidate → scripts/demo-images/cand-*.jpg
 *   npx tsx scripts/demo-images.ts build        download the picks → public/uploads/{demo,categories}
 *   npx tsx scripts/demo-images.ts sheet        contact sheet of what was built → scripts/demo-images/sheet-*.jpg
 *
 * scripts/demo-images/picks.json ({ "<key>": [candidateIndex, …] }) chooses
 * which candidates are used, in order; keys without an entry take the first
 * ones. Search results are stable enough for the picks to be committed.
 *
 * Output is NOT committed (public/uploads is gitignored). On the VPS, rsync
 * public/uploads/{demo,categories} up, or run search + build there.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { wants, type Want } from "./demo-images/manifest";

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, "scripts", "demo-images");
const CANDIDATES = join(CACHE_DIR, "candidates.json");
const PICKS = join(CACHE_DIR, "picks.json");
const UA = "bzaro-demo-seed/1.0 (https://bzaro.in; rahulmauryaliveai@gmail.com)";
const PER_KEY = 8;

type Candidate = {
  id: string;
  title: string;
  /** Full-size (≤1400px) rendition. */
  url: string;
  /** 320px rendition for review sheets. */
  thumbnail: string;
  license: string;
  creator: string | null;
  page: string;
};

type CommonsPage = {
  pageid: number;
  index: number;
  title: string;
  imageinfo?: Array<{
    url: string;
    thumburl?: string;
    descriptionurl: string;
    mime: string;
    extmetadata?: Record<string, { value: string }>;
  }>;
};

type Attribution = {
  file: string;
  title: string;
  creator: string | null;
  license: string;
  page: string;
};

const readJson = <T>(file: string, fallback: T): T =>
  existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fileName(want: Want, index: number): string {
  const base = want.dir === "categories" ? want.key.replace(/^category-/, "") : want.key;
  return want.indexed ? `${base}-${index}.webp` : `${base}.webp`;
}

async function get(url: string, timeoutMs = 30_000): Promise<Response> {
  return fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
}

// ── search ───────────────────────────────────────────────────────────────────

async function search() {
  const cache = readJson<Record<string, Candidate[]>>(CANDIDATES, {});
  const todo = wants().filter((w) => !cache[w.key]);
  console.log(`${todo.length} searches to run (${Object.keys(cache).length} cached)`);

  for (const [i, want] of todo.entries()) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrnamespace: "6",
      gsrlimit: String(PER_KEY),
      // Bitmaps only — no SVG diagrams, PDFs or audio.
      gsrsearch: `${want.query} filetype:bitmap`,
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: "1400",
    });
    const res = await get(`https://commons.wikimedia.org/w/api.php?${params}`);
    if (!res.ok) {
      console.log(`   ${want.key}: HTTP ${res.status}`);
      continue;
    }
    const body = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
    const pages = Object.values(body.query?.pages ?? {}).sort((a, b) => a.index - b.index);
    cache[want.key] = pages.flatMap((page) => {
      const info = page.imageinfo?.[0];
      if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime)) return [];
      const meta = info.extmetadata ?? {};
      const full = info.thumburl ?? info.url;
      return [
        {
          id: String(page.pageid),
          title: page.title.replace(/^File:/, ""),
          url: full,
          thumbnail: full.replace(/\/1400px-/, "/320px-"),
          license: meta.LicenseShortName?.value ?? "see page",
          creator: meta.Artist?.value?.replace(/<[^>]+>/g, "").trim() || null,
          page: info.descriptionurl,
        },
      ];
    });
    writeFileSync(CANDIDATES, JSON.stringify(cache, null, 1));
    console.log(
      `   ${String(i + 1).padStart(3)}/${todo.length} ${want.key}: ${cache[want.key].length}`,
    );
    await sleep(500);
  }
}

// ── candidates (review sheets) ───────────────────────────────────────────────

function label(text: string, w: number, h = 18): Buffer {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#111" opacity="0.7"/>` +
      `<text x="4" y="${h - 5}" font-family="Arial" font-size="11" fill="#fff">${safe}</text></svg>`,
  );
}

async function thumb(url: string, size: number): Promise<Buffer | null> {
  try {
    const res = await get(url, 20_000);
    if (!res.ok) return null;
    return await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(size, size, { fit: "cover" })
      .toBuffer();
  } catch {
    return null;
  }
}

async function candidateSheets() {
  const cache = readJson<Record<string, Candidate[]>>(CANDIDATES, {});
  const picks = readJson<Record<string, number[]>>(PICKS, {});
  // --unpicked: only keys without an entry in picks.json (the review loop).
  const all = wants().filter((w) => !process.argv.includes("--unpicked") || !picks[w.key]);
  const cell = 120;
  const perSheet = 20;

  for (let s = 0; s * perSheet < all.length; s++) {
    const batch = all.slice(s * perSheet, (s + 1) * perSheet);
    const composites: OverlayOptions[] = [];
    for (const [r, want] of batch.entries()) {
      const thumbs = await Promise.all(
        (cache[want.key] ?? []).slice(0, PER_KEY).map((c) => thumb(c.thumbnail, cell)),
      );
      thumbs.forEach((img, c) => {
        if (!img) return;
        composites.push({ input: img, left: c * cell, top: r * cell });
        composites.push({ input: label(String(c), 18), left: c * cell, top: r * cell + cell - 18 });
      });
      composites.push({
        input: label(`${want.key} ×${want.count}`, PER_KEY * cell),
        left: 0,
        top: r * cell,
      });
    }
    const out = join(CACHE_DIR, `cand-${s + 1}.jpg`);
    await sharp({
      create: {
        width: PER_KEY * cell,
        height: batch.length * cell,
        channels: 3,
        background: "#fff",
      },
    })
      .composite(composites)
      .jpeg({ quality: 80 })
      .toFile(out);
    console.log(`   ${out}`);
  }
}

// ── build ────────────────────────────────────────────────────────────────────

async function download(candidate: Candidate): Promise<Buffer | null> {
  for (const url of [candidate.url, candidate.thumbnail]) {
    try {
      const res = await get(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5_000) continue;
      await sharp(buf).metadata(); // decodable?
      return buf;
    } catch {
      /* next rendition */
    }
  }
  return null;
}

async function build() {
  const cache = readJson<Record<string, Candidate[]>>(CANDIDATES, {});
  const picks = readJson<Record<string, number[]>>(PICKS, {});
  const attribution: Record<string, Attribution[]> = { demo: [], categories: [] };
  const force = process.argv.includes("--force");
  let written = 0;
  let missing = 0;

  for (const want of wants()) {
    const candidates = cache[want.key] ?? [];
    const order = picks[want.key] ?? candidates.map((_, i) => i);
    const outDir = join(ROOT, "public", "uploads", want.dir);
    mkdirSync(outDir, { recursive: true });

    let index = 0;
    for (const candidateIndex of order) {
      if (index >= want.count) break;
      const candidate = candidates[candidateIndex];
      if (!candidate) continue;
      const file = fileName(want, index);
      const target = join(outDir, file);
      if (force || !existsSync(target)) {
        const buf = await download(candidate);
        if (!buf) {
          console.log(`   ${want.key}[${candidateIndex}]: download failed, trying next`);
          continue;
        }
        await sharp(buf)
          .rotate()
          .resize(want.w, want.h, { fit: "cover", position: "attention" })
          .webp({ quality: 82 })
          .toFile(target);
        written++;
      }
      attribution[want.dir]!.push({
        file,
        title: candidate.title,
        creator: candidate.creator,
        license: candidate.license,
        page: candidate.page,
      });
      index++;
    }
    if (index < want.count) {
      missing += want.count - index;
      console.log(`   ${want.key}: ${index}/${want.count} filled`);
    }
  }

  for (const dir of ["demo", "categories"] as const) {
    mkdirSync(join(ROOT, "public", "uploads", dir), { recursive: true });
    writeFileSync(
      join(ROOT, "public", "uploads", dir, "ATTRIBUTION.json"),
      JSON.stringify(attribution[dir], null, 1),
    );
  }
  console.log(`✓ ${written} files written, ${missing} slots unfilled`);
}

// ── sheet (what was built) ───────────────────────────────────────────────────

async function sheet() {
  const cell = 220;
  const cols = 6;
  const perSheet = 36;
  const files: Array<{ path: string; text: string }> = [];
  for (const want of wants()) {
    for (let i = 0; i < want.count; i++) {
      const p = join(ROOT, "public", "uploads", want.dir, fileName(want, i));
      if (existsSync(p)) files.push({ path: p, text: fileName(want, i).replace(/\.webp$/, "") });
    }
  }
  for (let s = 0; s * perSheet < files.length; s++) {
    const batch = files.slice(s * perSheet, (s + 1) * perSheet);
    const rows = Math.ceil(batch.length / cols);
    const composites = await Promise.all(
      batch.map(async (f, i) => {
        const x = (i % cols) * cell;
        const y = Math.floor(i / cols) * cell;
        const img = await sharp(f.path).resize(cell, cell, { fit: "cover" }).toBuffer();
        return [
          { input: img, left: x, top: y },
          { input: label(f.text.slice(0, 32), cell, 24), left: x, top: y + cell - 24 },
        ];
      }),
    );
    const out = join(CACHE_DIR, `sheet-${s + 1}.jpg`);
    await sharp({
      create: { width: cols * cell, height: rows * cell, channels: 3, background: "#fff" },
    })
      .composite(composites.flat())
      .jpeg({ quality: 80 })
      .toFile(out);
    console.log(`   ${out} (${batch.length} images)`);
  }
}

const modes = { search, candidates: candidateSheets, build, sheet } as const;
const run = modes[process.argv[2] as keyof typeof modes];
if (!run) {
  console.error("usage: tsx scripts/demo-images.ts <search|candidates|build|sheet> [--force]");
  process.exit(1);
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});

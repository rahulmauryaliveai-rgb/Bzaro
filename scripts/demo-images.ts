/**
 * Fetch real, openly licensed photos for the showcase sellers and the
 * homepage category tiles, so demo data does not look like demo data.
 *
 * Source: the Openverse API (CC0 / CC BY / CC BY-SA images from Wikimedia,
 * Flickr and others). Anonymous access is limited to 20 requests/min and
 * 200/day, so searches are cached in scripts/demo-images/candidates.json and
 * only the chosen files are downloaded. Attribution for every file is written
 * next to the images (ATTRIBUTION.json) — CC BY requires it.
 *
 *   npx tsx scripts/demo-images.ts search      query Openverse, cache candidates
 *   npx tsx scripts/demo-images.ts build       download picks → public/uploads/{demo,categories}
 *   npx tsx scripts/demo-images.ts sheet       contact sheets for review → scripts/demo-images/sheet-*.jpg
 *
 * Choosing a different candidate: edit scripts/demo-images/picks.json
 * ({ "<key>": [candidateIndex, ...] }) and run `build` again.
 *
 * Output is NOT committed (public/uploads is gitignored). On the VPS, run
 * `search` + `build` there, or rsync public/uploads/{demo,categories} up.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { wants, type Want } from "./demo-images/manifest";

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, "scripts", "demo-images");
const CANDIDATES = join(CACHE_DIR, "candidates.json");
const PICKS = join(CACHE_DIR, "picks.json");
const UA = "bzaro-demo-seed/1.0 (https://bzaro.in)";

type Candidate = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  license: string;
  license_version: string;
  creator: string | null;
  source: string;
  foreign_landing_url: string;
};

type Attribution = {
  file: string;
  title: string;
  creator: string | null;
  license: string;
  source: string;
  page: string;
};

const readJson = <T>(file: string, fallback: T): T =>
  existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fileName(want: Want, index: number): string {
  const base = want.dir === "categories" ? want.key.replace(/^category-/, "") : want.key;
  return want.indexed ? `${base}-${index}.webp` : `${base}.webp`;
}

// ── search ───────────────────────────────────────────────────────────────────

async function search() {
  const cache = readJson<Record<string, Candidate[]>>(CANDIDATES, {});
  const todo = wants().filter((w) => !cache[w.key]);
  console.log(`${todo.length} searches to run (${Object.keys(cache).length} cached)`);

  for (const [i, want] of todo.entries()) {
    const params = new URLSearchParams({
      q: want.query,
      license: "cc0,by,by-sa",
      page_size: String(Math.min(20, Math.max(8, want.count * 3))),
      mature: "false",
      // No category/aspect filters: most Openverse records carry neither, and
      // filtering on them empties the result set. The build step crops.
    });

    const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
      headers: { "User-Agent": UA },
    });
    if (res.status === 429) {
      console.log("   rate limited — waiting 65 s");
      await sleep(65_000);
      continue;
    }
    if (!res.ok) {
      console.log(`   ${want.key}: HTTP ${res.status}`);
      continue;
    }
    const body = (await res.json()) as { results: Candidate[] };
    cache[want.key] = body.results.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      thumbnail: r.thumbnail,
      width: r.width,
      height: r.height,
      license: r.license,
      license_version: r.license_version,
      creator: r.creator,
      source: r.source,
      foreign_landing_url: r.foreign_landing_url,
    }));
    writeFileSync(CANDIDATES, JSON.stringify(cache, null, 1));
    console.log(
      `   ${String(i + 1).padStart(3)}/${todo.length} ${want.key}: ${cache[want.key].length} results`,
    );
    // 20/min anonymous burst limit.
    await sleep(3_200);
  }
}

// ── build ────────────────────────────────────────────────────────────────────

async function download(candidate: Candidate): Promise<Buffer | null> {
  for (const url of [candidate.url, candidate.thumbnail]) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5_000) continue;
      // Reject anything sharp cannot decode (HTML error pages, SVGs, …).
      await sharp(buf).metadata();
      return buf;
    } catch {
      /* try the next URL */
    }
  }
  return null;
}

async function build() {
  const cache = readJson<Record<string, Candidate[]>>(CANDIDATES, {});
  const picks = readJson<Record<string, number[]>>(PICKS, {});
  const attribution: Record<string, Attribution[]> = { demo: [], categories: [] };
  let written = 0;
  let missing = 0;

  for (const want of wants()) {
    const candidates = cache[want.key] ?? [];
    const chosen = picks[want.key] ?? candidates.map((_, i) => i);
    const outDir = join(ROOT, "public", "uploads", want.dir);
    mkdirSync(outDir, { recursive: true });

    let index = 0;
    for (const candidateIndex of chosen) {
      if (index >= want.count) break;
      const candidate = candidates[candidateIndex];
      if (!candidate) continue;

      const file = fileName(want, index);
      const target = join(outDir, file);
      if (!existsSync(target) || process.argv.includes("--force")) {
        const buf = await download(candidate);
        if (!buf) {
          console.log(`   ${want.key}[${candidateIndex}]: download failed, trying next candidate`);
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
        license: `${candidate.license.toUpperCase()} ${candidate.license_version}`.trim(),
        source: candidate.source,
        page: candidate.foreign_landing_url,
      });
      index++;
    }
    if (index < want.count) {
      missing += want.count - index;
      console.log(`   ${want.key}: only ${index}/${want.count} images available`);
    }
  }

  for (const dir of ["demo", "categories"] as const) {
    writeFileSync(
      join(ROOT, "public", "uploads", dir, "ATTRIBUTION.json"),
      JSON.stringify(attribution[dir], null, 1),
    );
  }
  console.log(`✓ ${written} files written, ${missing} slots unfilled`);
}

// ── sheet ────────────────────────────────────────────────────────────────────

async function sheet() {
  const all = wants();
  const cell = 220;
  const cols = 6;
  const perSheet = 36;
  const label = (text: string) =>
    Buffer.from(
      `<svg width="${cell}" height="28"><rect width="100%" height="100%" fill="#111" opacity="0.75"/>` +
        `<text x="6" y="19" font-family="Arial" font-size="13" fill="#fff">${text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .slice(0, 30)}</text></svg>`,
    );

  const files: Array<{ path: string; text: string }> = [];
  for (const want of all) {
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
          { input: label(f.text), left: x, top: y + cell - 28 },
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

const mode = process.argv[2];
const run = mode === "search" ? search : mode === "build" ? build : mode === "sheet" ? sheet : null;
if (!run) {
  console.error("usage: tsx scripts/demo-images.ts <search|build|sheet> [--force]");
  process.exit(1);
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});

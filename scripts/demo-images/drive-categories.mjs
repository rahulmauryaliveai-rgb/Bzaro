// Turn the images in the shared Drive folder (one per root category, named
// after the category) into homepage tiles: public/uploads/categories/<slug>.webp
//
//   node scripts/demo-images/drive-list.mjs <folderId>      (writes drive-files.tsv)
//   node scripts/demo-images/drive-categories.mjs           (downloads + converts)
//
// Matching is by name, case/punctuation-insensitive, against
// prisma/seed/data/categories.ts. Unmatched files are reported, not guessed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const W = 640;
const H = 480;
const OUT = "public/uploads/categories";

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/\.(jpe?g|png|webp|jfif)$/i, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Root categories from the seed data, without compiling TypeScript.
const src = readFileSync("prisma/seed/data/categories.ts", "utf8");
const roots = [...src.matchAll(/^  c\("([a-z0-9-]+)", "([^"]+)"/gm)].map((m) => ({
  slug: m[1],
  name: m[2],
  key: norm(m[2]),
}));

const files = readFileSync("scripts/demo-images/drive-files.tsv", "utf8")
  .trim()
  .split("\n")
  .map((line) => line.split("\t"))
  .map(([id, name]) => ({ id, name, key: norm(name) }));

mkdirSync(OUT, { recursive: true });
const done = new Set();
const report = { converted: [], unmatched: [], failed: [] };

for (const file of files) {
  const root = roots.find((r) => r.key === file.key);
  if (!root) {
    report.unmatched.push(file.name);
    continue;
  }
  if (done.has(root.slug)) continue; // first file wins for duplicates
  const target = `${OUT}/${root.slug}.webp`;
  try {
    const res = await fetch(`https://drive.google.com/uc?export=download&id=${file.id}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    await sharp(buf)
      .rotate()
      .resize(W, H, { fit: "cover", position: "attention" })
      .webp({ quality: 84 })
      .toFile(target);
    done.add(root.slug);
    report.converted.push(`${root.slug}  ←  ${file.name} (${meta.width}×${meta.height})`);
  } catch (error) {
    report.failed.push(`${file.name}: ${error.message}`);
  }
}

const missing = roots.filter((r) => !done.has(r.slug)).map((r) => r.name);
console.log(`converted ${report.converted.length}/${roots.length} root categories`);
for (const line of report.converted) console.log("  " + line);
if (report.unmatched.length) console.log("unmatched files:", report.unmatched);
if (report.failed.length) console.log("failed:", report.failed);
if (missing.length) console.log("categories without a Drive image (kept as is):", missing);

// Record where these came from, alongside the Commons attribution file.
const attributionPath = `${OUT}/ATTRIBUTION.json`;
const existing = existsSync(attributionPath)
  ? JSON.parse(readFileSync(attributionPath, "utf8"))
  : [];
const kept = existing.filter((a) => !done.has(a.file.replace(/\.webp$/, "")));
for (const slug of done)
  kept.push({ file: `${slug}.webp`, source: "owner-supplied (Google Drive folder)" });
writeFileSync(attributionPath, JSON.stringify(kept, null, 1));

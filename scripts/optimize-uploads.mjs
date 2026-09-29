#!/usr/bin/env node
/**
 * One-off: shrink seller photos already on disk (D46).
 *
 * New uploads are resized when they arrive (src/lib/media/optimize.ts). This
 * does the same for files uploaded before that, IN PLACE — same file name and
 * format, so every stored URL keeps working.
 *
 *   node scripts/optimize-uploads.mjs /srv/uploads            # dry run: report only
 *   node scripts/optimize-uploads.mjs /srv/uploads --apply    # rewrite
 *
 * With --apply, each original is first copied to <dir>-originals-<date>/ (same
 * relative path), so the change can be undone by copying that folder back.
 * Only files over 200 KB are touched; SVGs never.
 */
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import sharp from "sharp";

const root = process.argv[2];
const apply = process.argv.includes("--apply");
if (!root) {
  console.error("Usage: node scripts/optimize-uploads.mjs <uploads dir> [--apply]");
  process.exit(2);
}

const MIN_BYTES = 200 * 1024;
const backupRoot = `${root.replace(/\/+$/, "")}-originals-${new Date().toISOString().slice(0, 10)}`;

function edgeFor(path) {
  if (/\/logo\//.test(path)) return 600;
  if (/\/cover\//.test(path)) return 2000;
  return 1600;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

let seen = 0;
let changed = 0;
let before = 0;
let after = 0;

for await (const path of walk(root)) {
  const ext = extname(path).slice(1).toLowerCase();
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) continue;
  const size = (await stat(path)).size;
  seen += 1;
  if (size < MIN_BYTES) continue;

  const input = await readFile(path);
  let output;
  try {
    const edge = edgeFor(path);
    const pipeline = sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
    output =
      ext === "png"
        ? await pipeline.png({ compressionLevel: 9, effort: 7 }).toBuffer()
        : ext === "webp"
          ? await pipeline.webp({ quality: 80 }).toBuffer()
          : await pipeline.jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer();
  } catch (error) {
    console.warn(`skip ${relative(root, path)}: ${error.message}`);
    continue;
  }
  if (output.length >= size * 0.9) continue;

  changed += 1;
  before += size;
  after += output.length;
  console.log(
    `${apply ? "shrunk" : "would shrink"} ${relative(root, path)}  ${Math.round(size / 1024)} KB → ${Math.round(output.length / 1024)} KB`,
  );
  if (apply) {
    const backup = join(backupRoot, relative(root, path));
    await mkdir(dirname(backup), { recursive: true });
    await copyFile(path, backup);
    await writeFile(path, output);
  }
}

console.log(
  `\n${seen} images checked, ${changed} ${apply ? "shrunk" : "would shrink"}: ` +
    `${Math.round(before / 1024 / 1024)} MB → ${Math.round(after / 1024 / 1024)} MB` +
    (apply ? `\nOriginals saved in ${backupRoot}` : "\nDry run — add --apply to rewrite."),
);

// List image files in a PUBLIC Google Drive folder from its HTML listing.
//   node scripts/demo-images/drive-list.mjs <folderId>  → scripts/demo-images/drive-files.tsv (id<TAB>name)
import { writeFileSync } from "node:fs";

const folderId = process.argv[2];
if (!folderId) throw new Error("folder id required");

const html = await (
  await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  })
).text();

// Each grid tile: data-id="<fileId>" … data-tooltip="<name> Image"
const files = new Map();
for (const m of html.matchAll(
  /data-id="([A-Za-z0-9_-]{20,})"[^>]*data-tooltip="([^"]+?) Image"/g,
)) {
  const name = m[2]
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  if (!files.has(m[1])) files.set(m[1], name);
}
const lines = [...files].map(([id, name]) => `${id}\t${name}`);
writeFileSync("scripts/demo-images/drive-files.tsv", lines.join("\n") + "\n");
console.log(`${files.size} files`);
console.log(lines.join("\n"));

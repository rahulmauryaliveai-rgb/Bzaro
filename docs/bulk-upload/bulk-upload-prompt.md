Build bulk product upload for sellers in Bzaro: Excel upload for product details, then photos uploaded in bulk and matched by SKU. Do the whole feature in one go, then run `npm run verify` and `npm run build` and fix everything until both pass.

Read `AGENTS.md` first (Next.js 16 differs from your training data). Reuse existing code; do not build parallel versions:
- Product rules: `src/lib/validation/catalog.ts` (`productSchema`, specs/tags schemas, 12-image cap)
- Product writes: `src/server/services/catalog.service.ts` (`createProduct`, `updateProduct`, `reserveSlug`, moderation)
- Tenant scoping: `src/lib/db-tenant.ts` — every query scoped to the signed-in seller
- Image upload: `src/server/actions/media.ts` (`requestUploadAction` → upload → `confirmUploadAction`), same target as the single-product form, keep `optimizeUpload`
- Cache: `src/lib/cache/revalidate.ts` (homepage is prerendered, so revalidate after import and publish)
- Plan limit: `maxProducts` from `src/server/services/plan.service.ts`
- Rate limiting: `src/lib/ratelimit.ts`

## Template
The two attached workbooks are the exact format: `docs/bulk-upload/Bzaro_Product_Upload_Template.xlsx` (blank) and `docs/bulk-upload/Bzaro_Demo_Products.xlsx` (10 sample rows). Inspect them with exceljs and reproduce them exactly — sheet names, headers, header comments, dropdowns, defined names, hidden `Lists` sheet.

Generate both live from the database with `exceljs` (active leaf categories), so new categories appear automatically:
`GET /dashboard/products/import/template` and `?demo=1`. Keep the demo rows in `src/lib/import/demo-products.ts`.

Products sheet columns (row 1 headers, data from row 2, max 1000 rows):
Product Name* · SKU / Product Code* · Main Category* · Sub Category* · Price (₹) · Max Price (₹) · Unit · Min Order Qty · Brand · Model Number · Short Description · Full Description · Specifications (`Key: Value | Key: Value`) · Search Tags (comma-separated).

## SKU
- Make `Product.sku` `@db.Citext` and add `@@unique([sellerId, sku])`. Before migrating, check for duplicate SKUs per seller; if any exist, STOP and show them to me — do not rename or delete.
- SKU format: `[A-Za-z0-9-]`, max 60 (no `_`, it separates photo numbers). Apply in the single-product form too, without breaking existing products that keep their old SKU.

## Excel import — `/dashboard/products/import`
1. Upload `.xlsx`/`.csv`, max 5 MB, check magic bytes, rate limited. Match headers by text (trim, case-insensitive, ignore `*`). Read cell values, not formulas. Skip blank rows.
2. Validate each row with the existing schema rules. Price accepts `1250`, `1,250`, `₹1,250`; blank price = price on request. Match Sub Category by leaf name case-insensitively (also accept slug), suggest closest matches if unknown. Duplicate SKU in the file = error on both rows.
3. Preview before saving: each row New / Update (SKU exists) / Error / Over plan limit, errors shown as "Row 14 · Price: write only a number, e.g. 85". Provide "Download error report" = the seller's rows plus an Errors column. Valid rows import even if others have errors.
4. Keep the parsed result in Redis (TTL 30 min) so the file is not re-uploaded and the client cannot change rows between preview and import.
5. Import: new products as DRAFT; updates overwrite only filled cells (blank = keep existing). Write in chunks of 100 in transactions, guard against double-submit, recount category counts and revalidate once at the end. New rows beyond `maxProducts` are skipped with an upgrade banner.
6. Add a small `ImportJob` table (seller, file name, counts, errors, status, dates) and show the last 10 imports.

## Bulk photos — `/dashboard/products/import/photos`
1. Select many files or a whole folder, or drag and drop. JPG/PNG/WEBP, existing size limit, up to 500 per batch.
2. File name → SKU: `SKU.jpg` = photo 1, `SKU_2.jpg` = photo 2, up to `_12`. Case-insensitive, this seller's products only.
3. Before uploading, show matched photos per product, unmatched files with a product dropdown to assign by hand, and a choice: add to existing photos (default) or replace them. Respect the 12-photo cap.
4. Upload through the existing media flow, 3 at a time with retry and a progress bar. The server must re-check that each product belongs to the seller.

## Publish and entry points
- Products list: "Bulk upload" button, "Missing photos" filter, select + "Publish selected" (only products with a category and at least one photo; moderation applies as today).
- Empty products page: "Have many products? Upload them with Excel" with template and demo links.
- UI: mobile-first, shadcn, simple English that a small trader understands, step indicator 1 Upload Excel → 2 Check → 3 Add photos → 4 Publish.

## Tests
Vitest for the Excel parser (the demo workbook must import with 0 errors; also bad prices, unknown category, duplicate SKU, missing column, 1001 rows) and the photo-name parser. Extend `tests/e2e/tenant-isolation.spec.ts` so seller A can never update or attach photos to seller B's products.

Add a decision entry to `docs/DECISIONS.md`. When done, give me a short summary of what changed and how to test it.

import { requireSeller } from "@/lib/auth/guards";
import { buildTemplateWorkbook } from "@/lib/import/template";
import { getTemplateTaxonomy } from "@/server/services/import-template.service";

/**
 * The upload template, and the demo file at `?demo=1` (D49).
 *
 * ── Why a route handler rather than a static file ───────────────────────────
 * Both workbooks are generated from the live taxonomy on every request, so a
 * category an admin added this morning is in the dropdown this afternoon with
 * nobody regenerating anything. See `lib/import/template.ts`.
 *
 * ── Signed in, even though nothing here is private ─────────────────────────
 * The taxonomy is public and the file contains no seller data, so the guard is
 * not protecting a secret. It is here because this is a dashboard URL and an
 * anonymous visitor reaching it means a link is wrong — and because generating
 * a 100 KB workbook from the database is enough work that it should not be an
 * open endpoint.
 */

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  await requireSeller();

  const demo = new URL(request.url).searchParams.get("demo") === "1";

  const { categories } = await getTemplateTaxonomy();
  const workbook = await buildTemplateWorkbook({ categories, demo });

  const fileName = demo ? "Bzaro_Demo_Products.xlsx" : "Bzaro_Product_Upload_Template.xlsx";

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(workbook.byteLength),
      // Dashboard responses are already no-store (next.config.ts headers), and
      // a template cached past a taxonomy change is the one thing generating
      // it was meant to avoid.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

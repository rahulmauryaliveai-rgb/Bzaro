import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/guards";
import { formatMoney } from "@/lib/utils/money";
import { splitGst } from "@/lib/billing/gst";
import {
  getBillingSettings,
  getInvoiceLine,
  getInvoiceRecipient,
} from "@/server/services/billing.service";
import { PrintButton } from "@/components/billing/PrintButton";

export const metadata: Metadata = {
  title: "Tax invoice",
  robots: { index: false, follow: false },
};

/**
 * GST tax invoice for a plan payment or an add-on (D41). Rendered as a page
 * the seller prints or saves as PDF from the browser — no PDF library, no
 * stored file to go stale. Scoped by sellerId in the WHERE clause, so an id
 * from another tenant is a 404.
 */

type Props = { params: Promise<{ type: string; id: string }> };

export default async function InvoicePage({ params }: Props) {
  const scope = await requireSeller();
  const { type, id } = await params;

  const [settings, seller, line] = await Promise.all([
    getBillingSettings(),
    getInvoiceRecipient(scope.sellerId),
    getInvoiceLine(scope.sellerId, type, id),
  ]);
  if (!seller) notFound();
  if (!line) notFound();

  const recipientState = seller.location?.parent?.name ?? null;
  const tax = splitGst(line.taxMinor, settings.state, recipientState);
  const inr = (minor: number) => formatMoney(minor, "INR");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/dashboard/billing" className="text-sm text-neutral-600 hover:underline">
          ← Plan &amp; billing
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-800 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            <p className="text-lg font-bold text-neutral-900">{settings.legalName ?? "Bzaro"}</p>
            {settings.address ? (
              <p className="mt-1 whitespace-pre-line">{settings.address}</p>
            ) : null}
            {settings.state ? <p>State: {settings.state}</p> : null}
            {settings.gstin ? <p>GSTIN: {settings.gstin}</p> : null}
            {settings.supportEmail ? <p>{settings.supportEmail}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold tracking-tight text-neutral-900">Tax Invoice</p>
            <p className="mt-1">
              No. <span className="font-mono">{line.number}</span>
            </p>
            <p>
              Date:{" "}
              {line.date.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </header>

        <section className="border-b border-neutral-200 py-6">
          <p className="text-xs tracking-wide text-neutral-500 uppercase">Billed to</p>
          <p className="mt-1 font-semibold text-neutral-900">
            {seller.legalName ?? seller.businessName}
          </p>
          {seller.addressLine1 ? <p>{seller.addressLine1}</p> : null}
          {seller.addressLine2 ? <p>{seller.addressLine2}</p> : null}
          <p>
            {[seller.location?.name, recipientState, seller.postalCode].filter(Boolean).join(", ")}
          </p>
          {seller.gstin ? <p>GSTIN: {seller.gstin}</p> : null}
          <p className="mt-1 text-xs text-neutral-500">Place of supply: {recipientState ?? "—"}</p>
        </section>

        <table className="mt-6 w-full">
          <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 font-medium">SAC</th>
              <th className="py-2 text-right font-medium">Taxable value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100">
              <td className="py-3">
                {line.description}
                {line.discountNote ? (
                  <span className="block text-xs text-neutral-500">{line.discountNote}</span>
                ) : null}
              </td>
              <td className="py-3">{settings.sacCode ?? "—"}</td>
              <td className="py-3 text-right tabular-nums">{inr(line.baseMinor)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 tabular-nums">
          {tax.intraState ? (
            <>
              <Row label={`CGST ${settings.gstRatePercent / 2}%`} value={inr(tax.cgstMinor)} />
              <Row label={`SGST ${settings.gstRatePercent / 2}%`} value={inr(tax.sgstMinor)} />
            </>
          ) : (
            <Row label={`IGST ${settings.gstRatePercent}%`} value={inr(tax.igstMinor)} />
          )}
          <div className="flex justify-between border-t border-neutral-300 pt-2 text-base font-semibold text-neutral-900">
            <dt>Total</dt>
            <dd>{inr(line.totalMinor)}</dd>
          </div>
        </dl>

        <footer className="mt-8 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
          {line.paymentRef ? <p>Paid online via Razorpay · Ref {line.paymentRef}</p> : <p>Paid</p>}
          <p className="mt-1">This is a computer-generated invoice and needs no signature.</p>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-600">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

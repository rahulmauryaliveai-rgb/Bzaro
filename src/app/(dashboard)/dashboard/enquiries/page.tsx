import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import { listSellerEnquiries } from "@/server/services/enquiry.service";
import { EnquiryStatusControl } from "@/components/dashboard/EnquiryStatusControl";

export const metadata: Metadata = {
  title: "Enquiries",
  robots: { index: false, follow: false },
};

/**
 * Seller enquiry inbox.
 *
 * Contact details are shown unmasked — decision D5(a): leads are free, and
 * revenue comes from visibility rather than from metering contact.
 *
 * Spam is hidden by default but reachable through the filter, never deleted. A
 * false positive is a real customer a real business never heard from, so a
 * human must always be able to go and find it.
 */

const PER_PAGE = 20;

type Props = {
  searchParams: Promise<{ status?: string; page?: string }>;
};

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "NEW", label: "New" },
  { value: "VIEWED", label: "Viewed" },
  { value: "RESPONDED", label: "Responded" },
  { value: "CONVERTED", label: "Won" },
  { value: "SPAM", label: "Spam" },
] as const;

type EnquiryStatus = "NEW" | "VIEWED" | "RESPONDED" | "CONVERTED" | "CLOSED" | "SPAM";

export default async function EnquiriesPage({ searchParams }: Props) {
  const scope = await requireSeller();
  const query = await searchParams;

  const status = STATUS_FILTERS.map((f) => f.value).includes(
    query.status as (typeof STATUS_FILTERS)[number]["value"],
  )
    ? (query.status as EnquiryStatus | undefined)
    : undefined;

  const page = Math.max(1, Math.min(500, Number.parseInt(query.page ?? "1", 10) || 1));

  const results = await listSellerEnquiries(scope.sellerId, {
    status,
    page,
    perPage: PER_PAGE,
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Enquiries</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {results.unread > 0 ? (
            <>
              <span className="font-medium text-neutral-900 tabular-nums">{results.unread}</span>{" "}
              new
            </>
          ) : (
            "Nothing new right now."
          )}
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200">
        {STATUS_FILTERS.map((filter) => {
          const active = status === filter.value;
          const href = filter.value
            ? `/dashboard/enquiries?status=${filter.value}`
            : "/dashboard/enquiries";

          return (
            <Link
              key={filter.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                active
                  ? "border-neutral-900 font-medium text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {results.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
          <p className="font-medium">No enquiries here yet</p>
          <p className="mt-1 text-sm text-neutral-600">
            Enquiries from your website and the marketplace arrive here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {results.items.map((enquiry) => (
            <li
              key={enquiry.id}
              className={`rounded-lg border bg-white p-5 ${
                enquiry.status === "NEW" ? "border-teal-500" : "border-neutral-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {enquiry.name}
                    {enquiry.company ? (
                      <span className="ml-2 text-sm font-normal text-neutral-500">
                        {enquiry.company}
                      </span>
                    ) : null}
                  </p>

                  <p className="mt-0.5 flex flex-wrap gap-x-4 text-sm text-neutral-600">
                    {enquiry.phone ? (
                      <a href={`tel:${enquiry.phone}`} className="hover:underline">
                        {enquiry.phone}
                      </a>
                    ) : null}
                    {enquiry.email ? (
                      <a href={`mailto:${enquiry.email}`} className="hover:underline">
                        {enquiry.email}
                      </a>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {enquiry.isSpam ? (
                    <span
                      className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                      title={`Spam score ${enquiry.spamScore?.toFixed(2) ?? "—"}`}
                    >
                      Suspected spam
                    </span>
                  ) : null}
                  <time
                    dateTime={enquiry.createdAt.toISOString()}
                    className="text-xs text-neutral-500"
                  >
                    {enquiry.createdAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                </div>
              </div>

              {(enquiry.product ?? enquiry.service) ? (
                <p className="mt-3 text-sm text-neutral-500">
                  About:{" "}
                  <span className="text-neutral-700">
                    {enquiry.product?.name ?? enquiry.service?.name}
                  </span>
                  {enquiry.quantity ? (
                    <span className="ml-2 tabular-nums">Qty {enquiry.quantity}</span>
                  ) : null}
                </p>
              ) : null}

              <p className="mt-3 text-sm whitespace-pre-wrap text-neutral-800">{enquiry.message}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                <EnquiryStatusControl enquiryId={enquiry.id} status={enquiry.status} />

                {enquiry.phone ? (
                  <a
                    href={`https://wa.me/${enquiry.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {results.pageCount > 1 ? (
        <nav className="mt-8 flex justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: results.pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/dashboard/enquiries?${status ? `status=${status}&` : ""}page=${n}`}
              aria-current={n === results.page ? "page" : undefined}
              className={`min-w-9 rounded-md border px-3 py-1.5 text-center text-sm tabular-nums ${
                n === results.page
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300"
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

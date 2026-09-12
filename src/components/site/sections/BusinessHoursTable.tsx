import { formatInterval, isOpenNow, parseBusinessHours, weekSchedule } from "@/lib/utils/hours";
import type { BusinessHours } from "@/lib/tenant/context";

/**
 * Opening hours.
 *
 * Renders nothing when hours are not listed — deliberately. Showing an empty
 * table, or worse defaulting every day to "Closed", tells buyers a supplier is
 * shut when the seller simply never filled the field in. That costs real
 * enquiries, and the seller would never know why.
 *
 * The open/closed badge is computed on the server in the seller's own timezone.
 * Because microsite pages are cached, the badge can be up to the revalidation
 * window stale — so it is phrased as a status, and the full week's hours are
 * always shown beneath it as the authoritative answer.
 */

export function BusinessHoursTable({
  hours,
  timezone,
}: {
  hours: BusinessHours | null;
  timezone: string;
}) {
  const parsed = parseBusinessHours(hours);
  if (!parsed) return null;

  const schedule = weekSchedule(parsed);
  const open = isOpenNow(parsed, timezone);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Business hours</h2>
        {open !== null ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={
              open
                ? { background: "color-mix(in srgb, var(--site-primary) 15%, transparent)" }
                : { background: "color-mix(in srgb, var(--site-foreground) 10%, transparent)" }
            }
          >
            {open ? "Open now" : "Closed now"}
          </span>
        ) : null}
      </div>

      <table className="w-full text-sm">
        <tbody>
          {schedule.map((day) => (
            <tr
              key={day.day}
              className="border-b last:border-0"
              style={{ borderColor: "var(--site-border)" }}
            >
              <th scope="row" className="py-2 pr-4 text-left font-normal opacity-70">
                {day.label}
              </th>
              <td className="py-2 text-right tabular-nums">
                {day.closed ? (
                  <span className="opacity-50">Closed</span>
                ) : (
                  day.intervals.map((interval) => (
                    <span key={`${interval.open}-${interval.close}`} className="block">
                      {formatInterval(interval)}
                    </span>
                  ))
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

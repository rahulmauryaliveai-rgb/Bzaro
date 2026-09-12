import { z } from "zod";

/**
 * Business hours.
 *
 * Stored as JSON on `Seller.businessHours` and validated on read — the column
 * is seller-supplied, and a malformed value must degrade to "hours not listed"
 * rather than throwing inside a cached page render.
 *
 * Times are wall-clock strings in the seller's own timezone
 * (`Seller.timezone`), not UTC instants. That is correct for opening hours:
 * "we open at 9:30" does not shift when the clocks change, and converting to
 * UTC and back would introduce exactly that bug.
 */

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const intervalSchema = z.object({
  open: z.string().regex(timePattern),
  close: z.string().regex(timePattern),
});

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

const DAY_LABELS: Record<Day, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** schema.org day names, for LocalBusiness openingHoursSpecification. */
const SCHEMA_DAYS: Record<Day, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const businessHoursSchema = z
  .object({
    mon: z.array(intervalSchema).max(3).optional(),
    tue: z.array(intervalSchema).max(3).optional(),
    wed: z.array(intervalSchema).max(3).optional(),
    thu: z.array(intervalSchema).max(3).optional(),
    fri: z.array(intervalSchema).max(3).optional(),
    sat: z.array(intervalSchema).max(3).optional(),
    sun: z.array(intervalSchema).max(3).optional(),
  })
  .strip();

export type BusinessHours = z.infer<typeof businessHoursSchema>;

export type DayHours = {
  day: Day;
  label: string;
  intervals: Array<{ open: string; close: string }>;
  closed: boolean;
};

/** Parse seller-supplied hours, returning null when absent or malformed. */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  if (!value || typeof value !== "object") return null;
  const parsed = businessHoursSchema.safeParse(value);
  if (!parsed.success) return null;

  const hasAny = DAYS.some((day) => (parsed.data[day]?.length ?? 0) > 0);
  return hasAny ? parsed.data : null;
}

/** Expand to a full week, including closed days, for rendering a table. */
export function weekSchedule(hours: BusinessHours): DayHours[] {
  return DAYS.map((day) => {
    const intervals = hours[day] ?? [];
    return {
      day,
      label: DAY_LABELS[day],
      intervals,
      closed: intervals.length === 0,
    };
  });
}

/** "9:30 am – 6:30 pm" — 12-hour is what Indian business listings use. */
export function formatInterval(interval: { open: string; close: string }): string {
  return `${formatTime(interval.open)} – ${formatTime(interval.close)}`;
}

function formatTime(value: string): string {
  const [h, m] = value.split(":").map(Number) as [number, number];
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Is the business open at `now`, in its own timezone?
 *
 * The timezone conversion goes through `Intl.DateTimeFormat` rather than date
 * arithmetic, so DST is handled by the platform's tz database instead of by us.
 *
 * Returns null when hours are not listed — which the UI must render as "hours
 * not listed", never as "closed". Telling a buyer a supplier is closed when the
 * seller simply never filled in the field costs that seller real enquiries.
 */
export function isOpenNow(
  hours: BusinessHours,
  timezone: string,
  now: Date = new Date(),
): boolean | null {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
  } catch {
    // An invalid IANA timezone must not break the page.
    return null;
  }

  const weekday = parts
    .find((p) => p.type === "weekday")
    ?.value.toLowerCase()
    .slice(0, 3);
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;

  if (!weekday || !hour || !minute) return null;

  const day = DAYS.find((d) => d === weekday);
  if (!day) return null;

  const intervals = hours[day] ?? [];
  if (intervals.length === 0) return false;

  // "24" can appear for midnight under hour12:false in some environments.
  const current = `${hour === "24" ? "00" : hour}:${minute}`;

  return intervals.some((interval) => current >= interval.open && current < interval.close);
}

/** openingHoursSpecification entries for LocalBusiness structured data. */
export function toSchemaOpeningHours(hours: BusinessHours) {
  return DAYS.flatMap((day) =>
    (hours[day] ?? []).map((interval) => ({
      "@type": "OpeningHoursSpecification" as const,
      dayOfWeek: SCHEMA_DAYS[day],
      opens: interval.open,
      closes: interval.close,
    })),
  );
}

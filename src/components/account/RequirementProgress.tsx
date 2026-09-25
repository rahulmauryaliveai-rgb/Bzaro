import type { RequirementProgress as Progress } from "@/server/services/buyer-account.service";

/**
 * Sent → Viewed → Responded (→ Closed). Each step carries the count or date
 * that makes it true, so the line doubles as the summary.
 */
export function RequirementProgress({
  progress,
  closed,
  labels,
}: {
  progress: Progress;
  closed?: boolean;
  /** Override the default step captions (the detail page uses dates). */
  labels?: Partial<Record<"sent" | "viewed" | "responded" | "closed", string>>;
}) {
  const steps = [
    { key: "sent", done: progress.sent > 0, label: labels?.sent ?? `Sent to ${progress.sent}` },
    {
      key: "viewed",
      done: progress.viewed > 0,
      label: labels?.viewed ?? (progress.viewed > 0 ? `Viewed by ${progress.viewed}` : "Viewed"),
    },
    {
      key: "responded",
      done: progress.responded > 0,
      label:
        labels?.responded ??
        (progress.responded > 0 ? `${progress.responded} responded` : "Responded"),
    },
    ...(closed !== undefined
      ? [{ key: "closed", done: closed, label: labels?.closed ?? "Closed" }]
      : []),
  ];

  return (
    <ol className="flex flex-wrap items-center gap-y-2 text-xs sm:text-sm" aria-label="Progress">
      {steps.map((step, index) => (
        <li key={step.key} className="flex items-center">
          {index > 0 ? (
            <span
              aria-hidden="true"
              className={`mx-2 h-0.5 w-6 sm:w-10 ${step.done ? "bg-accent-600" : "bg-neutral-200"}`}
            />
          ) : null}
          <span
            className={`flex items-center gap-1.5 font-medium ${step.done ? "text-neutral-900" : "text-neutral-400"}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] ${
                step.done
                  ? "border-accent-600 bg-accent-600 text-white"
                  : "border-neutral-300 bg-white"
              }`}
            >
              {step.done ? "✓" : index + 1}
            </span>
            {step.label}
            <span className="sr-only">{step.done ? " (done)" : " (pending)"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One chip summarising where a requirement stands. */
export function RequirementStatusChip({
  progress,
  closed,
}: {
  progress: Progress;
  closed: boolean;
}) {
  if (closed) {
    return (
      <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
        Closed
      </span>
    );
  }
  if (progress.responded > 0) {
    return (
      <span className="bg-accent-50 text-accent-800 rounded-full px-2.5 py-0.5 text-xs font-semibold">
        {progress.responded} responded
      </span>
    );
  }
  if (progress.viewed > 0) {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        Viewed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
      Sent
    </span>
  );
}

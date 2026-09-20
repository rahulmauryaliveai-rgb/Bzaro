import Link from "next/link";
import type { CompletionResult } from "@/lib/onboarding/completion";
import type { OnboardingStep } from "@/generated/prisma/enums";

/**
 * The profile-completion bar on the dashboard overview.
 *
 * Shows the score, the three highest-value things still missing, and — until
 * onboarding is COMPLETE — a link back into the step the seller left.
 */
export function ProfileCompletionBar({
  completion,
  onboardingStep,
  resumeHref,
}: {
  completion: CompletionResult;
  onboardingStep: OnboardingStep;
  resumeHref: string;
}) {
  const complete = completion.score >= 100;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          Profile completion
        </h2>
        <span className="text-2xl font-semibold tabular-nums">{completion.score}%</span>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100"
        role="progressbar"
        aria-valuenow={completion.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completion"
      >
        <div
          className={`h-full rounded-full ${complete ? "bg-teal-600" : "bg-neutral-900"}`}
          style={{ width: `${completion.score}%` }}
        />
      </div>

      {onboardingStep !== "COMPLETE" ? (
        <p className="mt-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">
          You stopped part-way through setup.{" "}
          <Link href={resumeHref} className="font-medium underline underline-offset-2">
            Continue where you left off
          </Link>
        </p>
      ) : null}

      {completion.next.length > 0 ? (
        <ul className="mt-4 space-y-1.5 text-sm">
          {completion.next.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3">
              <span className="text-neutral-700">{item.label}</span>
              <Link
                href={item.href}
                className="shrink-0 text-xs text-teal-700 underline-offset-2 hover:underline"
              >
                +{item.weight}% →
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-neutral-600">Everything is filled in. Nice.</p>
      )}
    </section>
  );
}

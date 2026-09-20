/**
 * The five onboarding steps, with the current one marked. Server component;
 * pages pass the step they render. Done steps link back so a seller can
 * revise; future steps do not.
 */

const STEPS = [
  { key: "ACCOUNT", label: "Account", href: "/register" },
  { key: "BUSINESS", label: "Business", href: "/register/business" },
  { key: "TRUST", label: "Trust", href: "/register/trust" },
  { key: "THEME", label: "Website look", href: "/register/theme" },
  { key: "CATALOG", label: "Catalogue", href: "/register/catalog" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export function Stepper({ current }: { current: StepKey }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="mb-8 flex items-center gap-2 text-xs" aria-label="Registration steps">
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                state === "done"
                  ? "bg-teal-600 text-white"
                  : state === "current"
                    ? "bg-neutral-900 text-white"
                    : "border border-neutral-300 text-neutral-500"
              }`}
            >
              {state === "done" ? "✓" : index + 1}
            </span>
            <span className={state === "todo" ? "text-neutral-400" : "text-neutral-800"}>
              {step.label}
            </span>
            {index < STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-neutral-300" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

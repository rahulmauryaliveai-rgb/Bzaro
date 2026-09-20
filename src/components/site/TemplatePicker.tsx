import { Check } from "lucide-react";
import { themeTokensSchema } from "@/lib/validation/theme";

/**
 * Website template picker (D33). One form per card: clicking "Use this look"
 * posts `templateKey` to whichever action the page supplies (onboarding,
 * dashboard or admin), so the same cards serve all three.
 *
 * The preview is the screenshot from `previewImage` when the seed provided
 * one; otherwise a swatch built from the template's default tokens, so a
 * template added without a screenshot still shows its palette.
 */
export type PickableTemplate = {
  key: string;
  name: string;
  description: string | null;
  previewImage: string | null;
  isPremium: boolean;
  defaultTokens: unknown;
};

export function TemplatePicker({
  templates,
  currentKey,
  action,
  hidden = {},
  columns = 3,
  ctaLabel = "Use this look",
  premiumAllowed = true,
}: {
  templates: PickableTemplate[];
  currentKey: string | null;
  action: (formData: FormData) => Promise<void>;
  /** Extra fields every form posts (e.g. the admin page's sellerId). */
  hidden?: Record<string, string>;
  columns?: 2 | 3 | 4;
  ctaLabel?: string;
  premiumAllowed?: boolean;
}) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return (
    <ul className={`grid gap-4 ${cols}`}>
      {templates.map((template) => {
        const tokens = themeTokensSchema.safeParse(template.defaultTokens);
        const palette = tokens.success ? tokens.data : null;
        const isCurrent = template.key === currentKey;
        const locked = template.isPremium && !premiumAllowed;

        return (
          <li
            key={template.key}
            className={`flex flex-col overflow-hidden rounded-xl border bg-white ${
              isCurrent ? "border-brand-500 ring-brand-500/30 ring-2" : "border-neutral-200"
            }`}
          >
            <div className="relative aspect-4/3 bg-neutral-100">
              {template.previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={template.previewImage}
                  alt={`${template.name} template preview`}
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
              ) : palette ? (
                <div className="flex h-full flex-col" style={{ background: palette.background }}>
                  <div className="h-3" style={{ background: palette.primary }} />
                  <div className="m-3 flex-1 rounded" style={{ background: palette.surface }} />
                  <div className="mx-3 mb-3 flex gap-2">
                    <span className="h-2 w-10 rounded" style={{ background: palette.primary }} />
                    <span className="h-2 w-6 rounded" style={{ background: palette.accent }} />
                  </div>
                </div>
              ) : null}
              {isCurrent ? (
                <span className="bg-brand-700 absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Current
                </span>
              ) : null}
              {template.isPremium ? (
                <span className="absolute top-2 right-2 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  Premium
                </span>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{template.name}</h3>
                {palette ? (
                  <span className="ml-auto flex gap-1" aria-hidden="true">
                    <span
                      className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                      style={{ background: palette.primary }}
                    />
                    <span
                      className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                      style={{ background: palette.accent }}
                    />
                    <span
                      className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                      style={{ background: palette.surface }}
                    />
                  </span>
                ) : null}
              </div>
              {template.description ? (
                <p className="mt-1 text-sm text-neutral-600">{template.description}</p>
              ) : null}

              <form action={action} className="mt-4">
                {Object.entries(hidden).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <input type="hidden" name="templateKey" value={template.key} />
                <button
                  type="submit"
                  disabled={isCurrent || locked}
                  className={`w-full rounded-md px-3 py-2 text-sm font-medium ${
                    isCurrent
                      ? "cursor-default border border-neutral-200 text-neutral-500"
                      : locked
                        ? "cursor-not-allowed border border-neutral-200 text-neutral-400"
                        : "bg-neutral-900 text-white hover:bg-neutral-700"
                  }`}
                >
                  {isCurrent ? "Selected" : locked ? "Premium plan required" : ctaLabel}
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

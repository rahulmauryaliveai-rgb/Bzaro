"use client";

import { useActionState, useState } from "react";
import {
  changeSlugAction,
  updateWebsiteAction,
  type SellerActionState,
} from "@/server/actions/seller";
import { clientEnv } from "@/env.client";
import type { ThemeTokens } from "@/lib/validation/theme";

/**
 * Website settings: template, theme, SEO overrides, and the web address.
 *
 * ── Theme editing is a fixed palette of constrained inputs ───────────────────
 * Colours are `<input type="color">`, fonts and variants are `<select>`s from
 * fixed lists. There is no free-text CSS field anywhere, because these values
 * become CSS custom properties on the seller's public site — a free-text field
 * here would be a style-injection vector on a domain shared with every other
 * seller (decision D7).
 *
 * ── The address form is deliberately separate ────────────────────────────────
 * Changing a slug breaks printed material and inbound links, and is limited to
 * once every 90 days (D11). It gets its own form, its own confirmation, and its
 * own submit button so nobody does it while saving colours.
 */

const INITIAL: SellerActionState = {};

const FONT_PAIRS = [
  { value: "plex", label: "IBM Plex — technical, neutral" },
  { value: "inter", label: "Inter — modern, clean" },
  { value: "source", label: "Source — readable, classic" },
  { value: "lora", label: "Lora — serif, traditional" },
  { value: "manrope", label: "Manrope — geometric" },
  { value: "dm-sans", label: "DM Sans — friendly" },
];

const RADII = [
  { value: "none", label: "Square" },
  { value: "sm", label: "Slightly rounded" },
  { value: "md", label: "Rounded" },
  { value: "lg", label: "Very rounded" },
  { value: "full", label: "Pill" },
];

const HEADERS = [
  { value: "classic", label: "Classic — logo left" },
  { value: "minimal", label: "Minimal" },
  { value: "centered", label: "Centred" },
  { value: "split", label: "Split" },
];

const HEROES = [
  { value: "cover", label: "Cover image" },
  { value: "split", label: "Split" },
  { value: "banner", label: "Banner" },
  { value: "plain", label: "Plain" },
];

export function WebsiteSettingsForm({
  templateKey,
  templates,
  tokens,
  metaTitle,
  metaDescription,
  slug,
  canChangeSlug,
  slugCooldownMessage,
}: {
  templateKey: string;
  templates: Array<{ key: string; name: string }>;
  tokens: ThemeTokens;
  metaTitle: string | null;
  metaDescription: string | null;
  slug: string;
  canChangeSlug: boolean;
  slugCooldownMessage: string | null;
}) {
  const [state, action, pending] = useActionState(updateWebsiteAction, INITIAL);

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-8">
        {state.ok ? (
          <p role="status" className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">
            {state.message}
          </p>
        ) : null}

        <fieldset className="rounded-lg border border-neutral-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Template
          </legend>

          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <label
                key={template.key}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-4 has-checked:border-neutral-900 has-checked:bg-neutral-50"
              >
                <input
                  type="radio"
                  name="templateKey"
                  value={template.key}
                  defaultChecked={template.key === templateKey}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">{template.name}</span>
                </span>
              </label>
            ))}
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            Switching template never loses content — every template shows the same
            information, arranged differently.
          </p>
        </fieldset>

        <fieldset className="rounded-lg border border-neutral-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Colours
          </legend>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ColourField name="primary" label="Primary" defaultValue={tokens.primary} />
            <ColourField name="accent" label="Accent" defaultValue={tokens.accent} />
            <ColourField name="background" label="Background" defaultValue={tokens.background} />
            <ColourField name="foreground" label="Text" defaultValue={tokens.foreground} />
            <ColourField name="surface" label="Cards" defaultValue={tokens.surface} />
            <ColourField name="border" label="Borders" defaultValue={tokens.border} />
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-neutral-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Style
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="fontPair" label="Typeface" options={FONT_PAIRS} defaultValue={tokens.fontPair} />
            <SelectField name="radius" label="Corners" options={RADII} defaultValue={tokens.radius} />
            <SelectField name="headerVariant" label="Header" options={HEADERS} defaultValue={tokens.headerVariant} />
            <SelectField name="heroVariant" label="Hero" options={HEROES} defaultValue={tokens.heroVariant} />
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-neutral-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Search appearance
          </legend>

          <div className="space-y-4">
            <div>
              <label htmlFor="metaTitle" className="mb-1 block text-sm font-medium">
                Page title
              </label>
              <input
                id="metaTitle"
                name="metaTitle"
                maxLength={70}
                defaultValue={metaTitle ?? ""}
                placeholder="Leave blank to use your business name"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              {state.fieldErrors?.metaTitle ? (
                <p className="mt-1 text-xs text-red-600">{state.fieldErrors.metaTitle}</p>
              ) : (
                <p className="mt-1 text-xs text-neutral-500">
                  Google usually shows about 60 characters.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="metaDescription" className="mb-1 block text-sm font-medium">
                Search description
              </label>
              <textarea
                id="metaDescription"
                name="metaDescription"
                rows={3}
                maxLength={200}
                defaultValue={metaDescription ?? ""}
                placeholder="Leave blank to use the start of your business description"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              {state.fieldErrors?.metaDescription ? (
                <p className="mt-1 text-xs text-red-600">{state.fieldErrors.metaDescription}</p>
              ) : (
                <p className="mt-1 text-xs text-neutral-500">
                  Google usually shows about 160 characters.
                </p>
              )}
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save website settings"}
        </button>
      </form>

      <SlugForm slug={slug} canChange={canChangeSlug} cooldownMessage={slugCooldownMessage} />
    </div>
  );
}

function SlugForm({
  slug,
  canChange,
  cooldownMessage,
}: {
  slug: string;
  canChange: boolean;
  cooldownMessage: string | null;
}) {
  const [state, action, pending] = useActionState(changeSlugAction, INITIAL);
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
        Web address
      </h2>

      <p className="mt-2 font-mono text-sm">
        {slug}.{clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}
      </p>

      {state.ok ? (
        <p role="status" className="mt-3 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {state.message}
        </p>
      ) : null}

      {!canChange ? (
        <p className="mt-3 text-sm text-neutral-600">
          {cooldownMessage ?? "You can change your address again later."}
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          Change web address
        </button>
      ) : (
        <form action={action} className="mt-4 space-y-3">
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Your current address will redirect here permanently, but anything printed with
            the old address will look wrong. You can only do this once every 90 days.
          </div>

          <div>
            <label htmlFor="new-slug" className="mb-1 block text-sm font-medium">
              New address
            </label>
            <div className="flex items-center rounded-md border border-neutral-300">
              <input
                id="new-slug"
                name="slug"
                required
                maxLength={63}
                defaultValue={slug}
                spellCheck={false}
                className="min-w-0 flex-1 rounded-l-md px-3 py-2 font-mono text-sm outline-none"
              />
              <span className="shrink-0 border-l border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm text-neutral-500">
                .{clientEnv.NEXT_PUBLIC_ROOT_DOMAIN}
              </span>
            </div>
            {state.fieldErrors?.slug ? (
              <p className="mt-1 text-xs text-red-600">{state.fieldErrors.slug}</p>
            ) : null}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" className="mt-0.5" />
            <span>I understand my web address will change.</span>
          </label>
          {state.fieldErrors?.confirm ? (
            <p className="text-xs text-red-600">{state.fieldErrors.confirm}</p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Changing…" : "Change address"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ColourField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="color"
          defaultValue={defaultValue}
          className="h-9 w-12 cursor-pointer rounded border border-neutral-300"
        />
        <span className="font-mono text-xs text-neutral-500">{defaultValue}</span>
      </div>
    </div>
  );
}

function SelectField({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

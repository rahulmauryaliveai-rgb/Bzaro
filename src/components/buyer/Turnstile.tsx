"use client";

import { useEffect, useRef } from "react";
import { clientEnv } from "@/env.client";

/**
 * Cloudflare Turnstile widget.
 *
 * Renders nothing when no site key is configured, so local development and the
 * e2e suite are not gated behind a captcha — matching the server's fail-open
 * rule in src/lib/turnstile.ts.
 *
 * The widget writes its token into a hidden input named `cf-turnstile-response`,
 * which is what the Server Action reads.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile() {
  const siteKey = clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    function render() {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        // The widget manages the hidden input itself under this name.
        "response-field-name": "cf-turnstile-response",
        // Tokens expire after 300 s; a buyer who leaves the form open longer
        // gets a fresh one silently instead of a failed submit.
        "refresh-expired": "auto",
      });
    }

    // A token is single-use. After every submit — success or a validation
    // error the buyer then fixes — fetch a fresh one, or the retry is rejected
    // as "already spent". The form data is captured synchronously on submit,
    // so resetting on the next tick cannot blank the token being sent.
    const form = containerRef.current?.closest("form") ?? null;
    function onSubmit() {
      window.setTimeout(() => {
        const id = widgetIdRef.current;
        if (id && window.turnstile) window.turnstile.reset(id);
      }, 0);
    }
    form?.addEventListener("submit", onSubmit);

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", render);
      } else {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", render);
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      form?.removeEventListener("submit", onSubmit);
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        window.turnstile.remove(id);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return <div ref={containerRef} className="my-2" />;
}

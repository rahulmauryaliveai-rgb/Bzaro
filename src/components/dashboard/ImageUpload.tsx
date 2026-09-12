"use client";

import { useRef, useState } from "react";
import { confirmUploadAction, requestUploadAction } from "@/server/actions/media";

/**
 * Upload control.
 *
 * ── The file never touches our server ────────────────────────────────────────
 * Sequence: ask for a signature, POST the file straight to the provider, then
 * hand the provider's response back for verification. The application server
 * sees two small JSON round trips and no image bytes.
 *
 * ── It stays a plain form field ──────────────────────────────────────────────
 * Whatever happens, the result ends up in a hidden input with the caller's
 * `name`. The surrounding form is submitted the ordinary way, so uploading is
 * an enhancement layered on top of a form that already worked by pasting a URL
 * — which is also the fallback offered when uploads are unconfigured.
 */

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; percent: number }
  | { status: "error"; message: string };

export type UploadedValue = {
  url: string;
  publicId: string;
  provider: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mimeType: string | null;
};

function humanSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(0)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * POST the file with progress.
 *
 * `XMLHttpRequest` rather than `fetch`: upload progress events are the one
 * thing fetch still cannot report, and on a phone connection an upload with no
 * feedback is indistinguishable from a hung page.
 */
function postFile(
  url: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText));
        } catch {
          reject(new Error("The upload service returned something unexpected."));
        }
      } else {
        reject(new Error(`Upload failed (${request.status}).`));
      }
    });

    request.addEventListener("error", () => reject(new Error("Upload failed.")));
    request.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

    request.send(form);
  });
}

export function ImageUpload({
  target,
  label,
  value,
  onChange,
  hint,
}: {
  target: "product" | "gallery" | "logo" | "cover";
  label: string;
  value: string;
  onChange: (next: UploadedValue | null) => void;
  hint?: string;
}) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setState({ status: "uploading", percent: 0 });

    try {
      const ticket = await requestUploadAction(target);

      if (!ticket.ok) {
        setState({ status: "error", message: ticket.error });
        return;
      }

      // Checked here as well as on the server so an oversized file fails
      // instantly instead of after a slow upload that was always going to be
      // rejected.
      if (file.size > ticket.maxBytes) {
        setState({
          status: "error",
          message: `That image is ${humanSize(file.size)}. The limit is ${humanSize(ticket.maxBytes)}.`,
        });
        return;
      }

      const form = new FormData();
      for (const [key, fieldValue] of Object.entries(ticket.fields)) {
        form.append(key, fieldValue);
      }
      // Appended LAST: providers expect the file after its parameters.
      form.append("file", file);

      const raw = await postFile(ticket.uploadUrl, form, (percent) =>
        setState({ status: "uploading", percent }),
      );

      const confirmed = await confirmUploadAction(target, raw);

      if (!confirmed.ok) {
        setState({ status: "error", message: confirmed.error });
        return;
      }

      onChange({
        url: confirmed.url,
        publicId: confirmed.publicId,
        provider: confirmed.provider,
        width: confirmed.width,
        height: confirmed.height,
        bytes: confirmed.bytes,
        mimeType: confirmed.mimeType,
      });

      setState({ status: "idle" });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium">{label}</span>

      <div className="flex items-start gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-20 w-20 shrink-0 rounded border border-neutral-200 object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-20 w-20 shrink-0 rounded border border-dashed border-neutral-300 bg-neutral-50"
          />
        )}

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void upload(file);
            }}
          />

          {state.status === "uploading" ? (
            <p className="mt-1 text-xs text-neutral-600" role="status">
              Uploading… {state.percent}%
            </p>
          ) : state.status === "error" ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {state.message}
            </p>
          ) : hint ? (
            <p className="mt-1 text-xs text-neutral-500">{hint}</p>
          ) : null}

          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                if (inputRef.current) inputRef.current.value = "";
                setState({ status: "idle" });
              }}
              className="mt-1 text-xs text-red-700 underline underline-offset-2"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

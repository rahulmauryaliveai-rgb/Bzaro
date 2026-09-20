import { LogOut } from "lucide-react";
import { signOutAction } from "@/server/actions/auth";

/**
 * Sign-out for the dashboard and admin sidebars. A form, not a link: signing
 * out is a state change and must not be triggerable by a prefetch or a
 * crawler following an <a>.
 */
export function SignOutButton({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={`inline-flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
          tone === "dark"
            ? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
        }`}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </button>
    </form>
  );
}

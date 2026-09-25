"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, UserRound } from "lucide-react";
import { signOutAction } from "@/server/actions/auth";

/**
 * Header account entry. The header is cached for everyone, so who is signed in
 * is asked from the browser after load (`/api/auth/session`, never cached).
 * Until then — and for guests — it renders the signed-out "Sign in" menu,
 * which splits buyers from sellers instead of sending everyone to /login.
 */

type SessionUser = { name?: string | null; email?: string | null; role?: string };

export function AccountMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((session: { user?: SessionUser } | null) => {
        if (!cancelled && session?.user) setUser(session.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const firstName = user?.name?.trim().split(/\s+/)[0] || null;
  const isSeller = user?.role === "SELLER_OWNER" || user?.role === "SELLER_STAFF";
  const isStaff = user?.role === "ADMIN" || user?.role === "MODERATOR" || user?.role === "SUPPORT";

  const item =
    "block rounded-md px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-100 focus-visible:bg-neutral-100";
  const caption =
    "px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="hover:text-brand-800 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
      >
        {user ? (
          <span className="bg-brand-700 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white">
            {(firstName ?? user.email ?? "B").charAt(0).toUpperCase()}
          </span>
        ) : (
          <UserRound className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden max-w-[8rem] truncate sm:inline">
          {user ? (firstName ?? "Account") : "Sign in"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {user ? (
            <>
              <Link role="menuitem" href="/account" className={item}>
                My Bzaro
              </Link>
              <Link role="menuitem" href="/account/requirements" className={item}>
                My requirements
              </Link>
              <Link role="menuitem" href="/account/saved" className={item}>
                Saved suppliers
              </Link>
              <Link role="menuitem" href="/account/orders" className={item}>
                My orders
              </Link>
              <Link role="menuitem" href="/account/profile" className={item}>
                Profile &amp; settings
              </Link>
              {isSeller || isStaff ? (
                <Link
                  role="menuitem"
                  href={isSeller ? "/dashboard" : "/admin"}
                  className={`${item} text-brand-800 font-medium`}
                >
                  {isSeller ? "Seller dashboard" : "Admin"}
                </Link>
              ) : null}
              <div className="my-1 h-px bg-neutral-200" />
              <form action={signOutAction}>
                <button
                  type="submit"
                  role="menuitem"
                  className={`${item} w-full text-left text-neutral-600`}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <p className={caption}>Buyers</p>
              <Link role="menuitem" href="/account/signin" className={item}>
                Sign in
              </Link>
              <Link role="menuitem" href="/account/signin?view=signup" className={item}>
                Create a buyer account
              </Link>
              <div className="my-1 h-px bg-neutral-200" />
              <p className={caption}>Sellers</p>
              <Link role="menuitem" href="/login" className={item}>
                Seller login
              </Link>
              <Link role="menuitem" href="/register" className={item}>
                List your business — free
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

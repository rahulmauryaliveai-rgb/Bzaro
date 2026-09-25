import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/guards";

/**
 * Who is signed in, for the cached marketplace header (AccountMenu).
 *
 * Read from the database rather than the session token: the token keeps the
 * name from sign-in (e.g. the Google profile name), while the buyer may since
 * have changed it — the header must match the account pages.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ user: null }, { headers });

  const user = await db.user.findFirst({
    where: { id: session.id, isActive: true, deletedAt: null },
    select: { name: true, email: true, role: true },
  });
  return NextResponse.json({ user }, { headers });
}

import type { PrismaClient } from "../../src/generated/prisma/client";
import { DEFAULT_LEAD_SETTINGS, LEAD_SETTINGS_KEY } from "../../src/lib/validation/lead-settings";

/**
 * Platform settings rows.
 *
 * Only seeded when absent: an admin who has tuned the lead weights in
 * production must not have them reset by a redeploy that re-runs the seed.
 * The application falls back to the same defaults when the row is missing,
 * so this exists mainly so the admin screen has something to show and edit.
 */
export async function seedSettings(prisma: PrismaClient) {
  const existing = await prisma.setting.findUnique({ where: { key: LEAD_SETTINGS_KEY } });
  if (!existing) {
    await prisma.setting.create({ data: { key: LEAD_SETTINGS_KEY, value: DEFAULT_LEAD_SETTINGS } });
  }
}

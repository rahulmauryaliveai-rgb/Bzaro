import { z } from "zod";

/**
 * Runtime-tunable lead rules, stored as one JSON row in `Setting` under
 * LEAD_SETTINGS_KEY and edited from the admin settings screen.
 *
 * Pure: no database, no Next.js. The service layer reads the row through
 * src/lib/settings.ts and falls back to DEFAULT_LEAD_SETTINGS when the row is
 * missing or fails validation, so a bad admin edit can never stop leads.
 *
 * Matching weights are documented in docs/LEADS.md §Matching. The plan weight
 * is the largest on purpose: it is the one lever the seller pays for.
 */

export const leadSettingsSchema = z.object({
  market: z
    .object({
      /** Fewest sellers a MARKET fan-out will target when enough qualify. */
      minSellers: z.number().int().min(0).max(50),
      /** Most sellers a MARKET fan-out will target. Consent text says ten. */
      maxSellers: z.number().int().min(1).max(50),
      /** Hours after creation at which an unaccepted MARKET lead expires. */
      expiryHours: z
        .number()
        .int()
        .min(1)
        .max(24 * 30),
    })
    .refine((v) => v.minSellers <= v.maxSellers, {
      message: "minSellers must not exceed maxSellers",
      path: ["minSellers"],
    }),
  /** Same buyer + same fingerprint inside this window → no new MARKET leads. */
  dedupeDays: z.number().int().min(0).max(90),
  /** Additive scoring weights. Any non-negative integer; only ratios matter. */
  weights: z.object({
    /** Multiplied by the plan's sortOrder (Free 0, Basic 1, Gold 2). */
    planTier: z.number().int().min(0),
    sameCity: z.number().int().min(0),
    sameCluster: z.number().int().min(0),
    servesCity: z.number().int().min(0),
    /** Multiplied by responseRate (0..1). */
    responseRate: z.number().int().min(0),
    primaryCategory: z.number().int().min(0),
  }),
  /** responseRate assumed for sellers with no lead history (0..1). */
  neutralResponseRate: z.number().min(0).max(1),
});

export type LeadSettings = z.infer<typeof leadSettingsSchema>;

export const DEFAULT_LEAD_SETTINGS: LeadSettings = {
  market: { minSellers: 7, maxSellers: 10, expiryHours: 48 },
  dedupeDays: 7,
  weights: {
    planTier: 100,
    sameCity: 30,
    sameCluster: 20,
    servesCity: 10,
    responseRate: 20,
    primaryCategory: 5,
  },
  neutralResponseRate: 0.5,
};

export const LEAD_SETTINGS_KEY = "leads";

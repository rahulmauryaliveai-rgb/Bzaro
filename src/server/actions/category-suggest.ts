"use server";

import { z } from "zod";
import {
  suggestCategories,
  type CategorySuggestion,
} from "@/server/services/category-suggest.service";

/**
 * Category suggestions for the requirement form (D43). Public: a buyer is
 * usually signed out while filling it in. Input is capped and only ever used
 * as a bound query parameter.
 */
export async function suggestCategoriesAction(query: string): Promise<CategorySuggestion[]> {
  const parsed = z.string().max(120).safeParse(query);
  if (!parsed.success) return [];
  try {
    return await suggestCategories(parsed.data);
  } catch (error) {
    console.error("[category-suggest]", error);
    return [];
  }
}

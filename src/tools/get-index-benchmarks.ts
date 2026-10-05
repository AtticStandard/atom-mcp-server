// ============================================================
// Tool: get_index_benchmarks
// Latest published level and spot price for every Attic Standard
// index, at the week the site shows (site_config gate).
// Fully public: this is what atticstandard.com publishes.
// ============================================================

import { z } from "zod";
import { enc, getActiveDate, inList, queryTable } from "../supabase.js";
import { BASE_MONTH, BASE_MONTH_END, BENCHMARK_NOTE, INDEX_FAMILIES, METHODOLOGY_PAGE } from "../config.js";
import { dirKey, errorResult, normIndexCode, respond, round } from "../util.js";
import type { Tier } from "../types.js";

export const getIndexBenchmarksSchema = {
  index_code: z
    .string()
    .optional()
    .describe("One index, e.g. 'TXT', 'NCL', 'FLG' or the full code 'AIPI TXT GLB'. Omit for all published indexes."),
  index_category: z
    .string()
    .optional()
    .describe(`Index family: ${INDEX_FAMILIES.map((f) => `'${f}'`).join(", ")}.`),
};

interface RegistryRow {
  index_code: string;
  index_category: string;
  index_description: string | null;
  index_definition: string | null;
  index_question: string | null;
  methodology_note: string | null;
  unit: string | null;
  display_order: number | null;
  is_flagship: boolean | null;
  parent_index: string | null;
}

export async function loadPublishedIndexes(filters: string[] = []): Promise<RegistryRow[]> {
  return queryTable<RegistryRow>("index_registry", ["is_published=is.true", ...filters], {
    select:
      "index_code,index_category,index_description,index_definition,index_question,methodology_note,unit,display_order,is_flagship,parent_index",
    order: "display_order.asc",
    limit: 200,
  });
}

/** Latest index_values date at or before the gate. */
export async function latestIndexDate(gate: string | null): Promise<string | null> {
  const rows = await queryTable<{ date: string }>(
    "index_values",
    gate ? [`date=lte.${enc(gate)}`] : [],
    { select: "date", order: "date.desc", limit: 1 }
  );
  return rows[0]?.date ? String(rows[0].date).slice(0, 10) : null;
}

export async function handleGetIndexBenchmarks(
  params: z.infer<z.ZodObject<typeof getIndexBenchmarksSchema>>,
  tier: Tier
) {
  const regFilters: string[] = [];
  if (params.index_code?.trim()) regFilters.push(`index_code=eq.${enc(normIndexCode(params.index_code))}`);
  if (params.index_category?.trim() && params.index_category !== "(any)")
    regFilters.push(`index_category=ilike.*${enc(params.index_category)}*`);

  const registry = await loadPublishedIndexes(regFilters);
  if (registry.length === 0) {
    return errorResult(
      "get_index_benchmarks",
      params.index_code
        ? `No published index matches '${params.index_code}'. Omit index_code to list all published indexes.`
        : "No published index matches that family."
    );
  }

  const gate = await getActiveDate();
  const date = await latestIndexDate(gate);
  const codes = registry.map((r) => r.index_code);

  const [values, levels, mayRows] = await Promise.all([
    queryTable<Record<string, any>>("index_values", [`date=eq.${enc(date || "")}`, `index_code=${inList(codes)}`], {
      select:
        "index_code,unit,sku_count,model_count,vendor_count,country_count,cohort_model_count,input_mom,cached_mom,output_mom," +
        "spot_input_price,spot_input_p25,spot_input_p75,spot_cached_price,spot_cached_p25,spot_cached_p75,spot_output_price,spot_output_p25,spot_output_p75," +
        "spot_input_vs_base,spot_input_mom,spot_input_wow,spot_cached_vs_base,spot_cached_mom,spot_cached_wow,spot_output_vs_base,spot_output_mom,spot_output_wow," +
        "coverage_note",
      limit: 500,
    }),
    queryTable<Record<string, any>>("v_index_rebased", [`date=eq.${enc(date || "")}`, `index_code=${inList(codes)}`], {
      select: "index_code,direction,level,wow,price",
      limit: 1000,
    }),
    // The May 2026 basket, so a spot change can be read against the
    // basket it compares with (same rule as the index card).
    queryTable<Record<string, any>>(
      "index_values",
      [`date=gte.${BASE_MONTH}-01`, `date=lt.${BASE_MONTH_END}`, `index_code=${inList(codes)}`],
      { select: "index_code,model_count,cohort_model_count", limit: 1000 }
    ),
  ]);

  const baseAvg = (code: string, key: string): number | null => {
    const xs = mayRows.filter((m) => m.index_code === code && Number(m[key]) > 0).map((m) => Number(m[key]));
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  };
  const basket = (now: any, base: number | null) => {
    const n = now != null ? Number(now) : null;
    return {
      at_base: base,
      changed_since_base: n != null && base != null ? base < 15 || Math.abs(n / base - 1) > 0.5 : null,
    };
  };

  const valueBy = new Map(values.map((v) => [v.index_code, v]));
  const levelBy = new Map<string, Record<string, any>>();
  for (const l of levels) {
    const k = dirKey(l.direction);
    const entry = levelBy.get(l.index_code) || {};
    entry[k] = {
      level: round(l.level, 2),
      change_wow_pct: round(l.wow, 2),
      change_vs_base_pct: l.level != null ? round(Number(l.level) - 100, 2) : null,
    };
    levelBy.set(l.index_code, entry);
  }

  const spot = (v: Record<string, any> | undefined, d: "input" | "cached" | "output") => {
    if (!v || v[`spot_${d}_price`] == null) return null;
    return {
      median: Number(v[`spot_${d}_price`]),
      p25: v[`spot_${d}_p25`] != null ? Number(v[`spot_${d}_p25`]) : null,
      p75: v[`spot_${d}_p75`] != null ? Number(v[`spot_${d}_p75`]) : null,
      change_vs_base_pct: round(v[`spot_${d}_vs_base`], 2),
      change_mom_pct: round(v[`spot_${d}_mom`], 2),
      change_wow_pct: round(v[`spot_${d}_wow`], 2),
    };
  };

  const indexes = registry.map((r) => {
    const v = valueBy.get(r.index_code);
    const bench = levelBy.get(r.index_code) || {};
    for (const d of ["input", "cached", "output"] as const) {
      if (bench[d] && v && v[`${d}_mom`] != null) bench[d].change_mom_pct = round(v[`${d}_mom`], 2);
    }
    return {
      index_code: r.index_code,
      family: r.index_category,
      flagship: !!r.is_flagship,
      parent_index: r.parent_index || undefined,
      description: r.index_description,
      question: r.index_question || undefined,
      unit: v?.unit || r.unit,
      benchmark: bench,
      spot: {
        input: spot(v, "input"),
        cached: spot(v, "cached"),
        output: spot(v, "output"),
      },
      coverage: v
        ? {
            skus: v.sku_count ?? null,
            models: v.model_count ?? null,
            vendors: v.vendor_count ?? null,
            countries: v.country_count ?? null,
            models_basket: basket(v.model_count, baseAvg(r.index_code, "model_count")),
            cohort_models: v.cohort_model_count ?? null,
            cohort_models_basket: v.cohort_model_count != null
              ? basket(v.cohort_model_count, baseAvg(r.index_code, "cohort_model_count"))
              : undefined,
            note: v.coverage_note || undefined,
          }
        : null,
    };
  });

  return respond("get_index_benchmarks", tier, {
    published_week: date,
    total_indexes: indexes.length,
    families: [...new Set(indexes.map((i) => i.family))],
    indexes,
    how_to_read: BENCHMARK_NOTE,
    methodology: METHODOLOGY_PAGE,
  });
}

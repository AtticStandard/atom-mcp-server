// ============================================================
// Tool: get_price_history
// Weekly history of an index (free), or the observed price
// history of a model's SKUs across vendors (PRO).
// ============================================================

import { z } from "zod";
import { enc, getActiveDate, inList, queryAll, queryTable } from "../supabase.js";
import { BENCHMARK_NOTE, CHANNEL_LABELS, UPGRADE_MESSAGE } from "../config.js";
import { anchorOf, dirKey, errorResult, expandAnchors, findModels, normIndexCode, respond, round, vendorLookup } from "../util.js";
import type { Tier } from "../types.js";

export const getPriceHistorySchema = {
  index_code: z
    .string()
    .optional()
    .describe("Index history, e.g. 'TXT', 'DEV', 'OSS' or 'AIPI TXT GLB'. Free."),
  model_name: z
    .string()
    .optional()
    .describe("Model price history across every vendor that sells it, e.g. 'GPT-4o'. PRO."),
  vendor: z.string().optional().describe("With model_name: limit to one vendor. PRO."),
  direction: z.enum(["Input", "Cached Input", "Output"]).optional().describe("Pricing direction"),
  weeks: z.coerce.number().int().min(1).max(260).default(26).describe("How many weeks back (default 26)"),
};

export async function handleGetPriceHistory(
  params: z.infer<z.ZodObject<typeof getPriceHistorySchema>>,
  tier: Tier
) {
  const gate = await getActiveDate();

  // ---------------- Index history (public) ----------------
  if (params.index_code?.trim() || !params.model_name) {
    const code = normIndexCode(params.index_code || "AIPI TXT GLB");
    const filters = [`index_code=eq.${enc(code)}`];
    if (gate) filters.push(`date=lte.${enc(gate)}`);
    const rows = await queryTable<Record<string, any>>("v_index_rebased", filters, {
      select: "date,direction,level,wow,price",
      order: "date.desc",
      limit: params.weeks * 3,
    });
    const spotRows = await queryTable<Record<string, any>>("index_values", filters, {
      select:
        "date,spot_input_price,spot_input_p25,spot_input_p75,spot_cached_price,spot_cached_p25,spot_cached_p75,spot_output_price,spot_output_p25,spot_output_p75",
      order: "date.desc",
      limit: params.weeks + 5,
    });
    const spotBy = new Map(spotRows.map((s) => [String(s.date).slice(0, 10), s]));
    const spotOf = (key: string, d: "input" | "cached" | "output") => {
      const s = spotBy.get(key);
      if (!s || s[`spot_${d}_price`] == null) return null;
      return {
        median: Number(s[`spot_${d}_price`]),
        p25: s[`spot_${d}_p25`] != null ? Number(s[`spot_${d}_p25`]) : null,
        p75: s[`spot_${d}_p75`] != null ? Number(s[`spot_${d}_p75`]) : null,
      };
    };
    const wanted = params.direction ? dirKey(params.direction) : null;
    const byDate = new Map<string, Record<string, any>>();
    for (const r of rows) {
      const d = dirKey(r.direction);
      if (wanted && d !== wanted) continue;
      const key = String(r.date).slice(0, 10);
      const e = byDate.get(key) || { date: key };
      e[d] = { level: round(r.level, 2), change_wow_pct: round(r.wow, 2), price: r.price, spot: spotOf(key, d) };
      byDate.set(key, e);
    }
    const series = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-params.weeks);
    if (series.length === 0) return errorResult("get_price_history", `No published history for '${code}'.`);
    return respond("get_price_history", tier, {
      mode: "index",
      index_code: code,
      weeks: series.length,
      base: "May 2026 = 100",
      series,
      how_to_read: BENCHMARK_NOTE,
    });
  }

  // ---------------- Model SKU history (PRO) ----------------
  const models = await findModels(params.model_name!, 10);
  if (models.length === 0)
    return errorResult("get_price_history", `No model matches '${params.model_name}'.`);
  const anchor = anchorOf(models[0]);
  const ids = await expandAnchors([anchor]);

  const filters = [`model_id=${inList(ids)}`, "normalized_price=gt.0"];
  if (params.direction) filters.push(`direction=eq.${enc(params.direction)}`);
  if (gate) filters.push(`verification_date=lte.${enc(gate)}`);
  const since = new Date(Date.now() - params.weeks * 7 * 86400000).toISOString().slice(0, 10);
  filters.push(`verification_date=gte.${enc(since)}`);

  let vendorIds: Set<string> | null = null;
  const vendors = await vendorLookup();
  if (params.vendor) {
    const v = params.vendor.toLowerCase();
    vendorIds = new Set(
      [...vendors.entries()]
        .filter(([id, x]) => id.toLowerCase().includes(v) || x.vendor_name.toLowerCase().includes(v))
        .map(([id]) => id)
    );
  }

  const rows = (
    await queryAll<Record<string, any>>("price_index", filters, {
      select: "sku_id,vendor_id,model_id,direction,normalized_price,normalized_price_unit,verification_date",
      order: "verification_date.asc",
    }, 10000)
  ).filter((r) => !vendorIds || vendorIds.has(r.vendor_id));

  if (tier !== "paid") {
    const dates = rows.map((r) => String(r.verification_date).slice(0, 10)).sort();
    return respond(
      "get_price_history",
      tier,
      {
        mode: "model",
        model: models[0].model_name,
        observations: rows.length,
        vendors: new Set(rows.map((r) => r.vendor_id)).size,
        first_week: dates[0] || null,
        last_week: dates[dates.length - 1] || null,
        upgrade: UPGRADE_MESSAGE,
      },
      "The week-by-week price history of this model at every vendor"
    );
  }

  // Collapse to one series per SKU, keeping only weeks where the price changed.
  const bySku = new Map<string, Record<string, any>>();
  for (const r of rows) {
    const e =
      bySku.get(r.sku_id) ||
      {
        sku_id: r.sku_id,
        vendor: vendors.get(r.vendor_id)?.vendor_name || r.vendor_id,
        channel: CHANNEL_LABELS[vendors.get(r.vendor_id)?.vendor_type || ""] || vendors.get(r.vendor_id)?.vendor_type || null,
        model_id: r.model_id,
        direction: r.direction,
        unit: r.normalized_price_unit,
        first_seen: String(r.verification_date).slice(0, 10),
        last_seen: null,
        current_price: null,
        changes: [] as { week: string; price: number }[],
      };
    const price = Number(r.normalized_price);
    const week = String(r.verification_date).slice(0, 10);
    if (e.current_price === null || e.current_price !== price) e.changes.push({ week, price });
    e.current_price = price;
    e.last_seen = week;
    bySku.set(r.sku_id, e);
  }

  return respond("get_price_history", tier, {
    mode: "model",
    model: models[0].model_name,
    anchor_model_id: anchor,
    weeks_requested: params.weeks,
    skus: [...bySku.values()].sort((a, b) => a.current_price - b.current_price),
    note: "Each SKU lists the weeks its price changed; a single entry means the price held for the whole window.",
  });
}

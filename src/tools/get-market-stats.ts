// ============================================================
// Tool: get_market_stats
// Coverage and price distribution across the tracked market.
// Distributions are split by unit and direction, because a
// median across per-token, per-image and per-second prices
// means nothing. Free: aggregates. PRO: adds vendor breakdown.
// Coverage counts include tracked services quoted in currencies
// with no published index yet (status 'tracking'), as on the
// site; price distributions stay USD-only.
// A vendor is a company (parent_vendor, else vendor_name); a
// pricing service is one price list. Same rule as the coverage
// page and v_summary_stats.
// ============================================================

import { z } from "zod";
import { enc, getActiveDate, queryAll, queryPublishedPrices } from "../supabase.js";
import { CHANNEL_LABELS, UPGRADE_MESSAGE } from "../config.js";
import { dirKey, quantile, respond } from "../util.js";
import { loadPublishedIndexes } from "./get-index-benchmarks.js";
import type { Tier } from "../types.js";

export const getMarketStatsSchema = {
  modality: z
    .string()
    .optional()
    .describe("Optional modality: Text, Multimodal, Image, Video, Audio, Voice"),
};

export async function handleGetMarketStats(
  params: z.infer<z.ZodObject<typeof getMarketStatsSchema>>,
  tier: Tier
) {
  const skuFilters = ["normalized_price=gt.0"];
  if (params.modality) skuFilters.push(`modality=ilike.*${enc(params.modality)}*`);

  const [gate, vendors, skus, indexes, registry] = await Promise.all([
    getActiveDate(),
    queryAll<Record<string, any>>("vendor_registry", [], {
      select: "vendor_id,vendor_name,parent_vendor,vendor_type,country,region,status,pricing_currency",
      order: "vendor_id.asc",
    }),
    queryPublishedPrices<Record<string, any>>(skuFilters, {
      select: "vendor_id,model_id,modality,direction,normalized_price,normalized_price_unit",
      order: "sku_id.asc",
    }),
    loadPublishedIndexes(),
    queryAll<{ model_id: string; canonical_model_id: string | null }>("model_registry", [], {
      select: "model_id,canonical_model_id",
      order: "model_id.asc",
    }),
  ]);
  const anchorBy = new Map(registry.map((m) => [m.model_id, m.canonical_model_id || m.model_id]));

  const statusOf = (v: Record<string, any>) => String(v.status || "active").toLowerCase();
  const active = vendors.filter((v) => statusOf(v) === "active" || statusOf(v) === "tracking");
  const trackedIds = new Set(active.map((v) => v.vendor_id));

  // Non-USD SKUs of tracked services at the published week: counted in
  // coverage, never mixed into the USD price distributions.
  const intlFilters = [`verification_date=eq.${gate}`, "normalized_price=gt.0"];
  if (params.modality) intlFilters.push(`modality=ilike.*${enc(params.modality)}*`);
  const intl = gate
    ? (await queryAll<Record<string, any>>("price_index_intl", intlFilters, {
        select: "vendor_id,model_id,modality",
        order: "sku_id.asc",
      })).filter((s) => trackedIds.has(s.vendor_id))
    : [];
  const allSkus = [...skus, ...intl];
  // A vendor is a company: its pricing services share one parent.
  const keyOf = (v: Record<string, any>) => String(v.parent_vendor || v.vendor_name || v.vendor_id);
  const skusByService = new Map<string, number>();
  for (const s of allSkus) skusByService.set(s.vendor_id, (skusByService.get(s.vendor_id) || 0) + 1);
  const priced = active.filter((v) => (skusByService.get(v.vendor_id) || 0) > 0);
  const channelOf = (v: Record<string, any>) => CHANNEL_LABELS[v.vendor_type] || v.vendor_type || "Unclassified";

  // A vendor is listed under the channel of its lead service: an indexed
  // service first, then the one with the most SKUs (as on the coverage page).
  const lead = new Map<string, Record<string, any>>();
  for (const v of priced) {
    const k = keyOf(v);
    const cur = lead.get(k);
    const rank = (x: Record<string, any>) => [statusOf(x) === "active" ? 1 : 0, skusByService.get(x.vendor_id) || 0];
    if (!cur) { lead.set(k, v); continue; }
    const [a1, a2] = rank(v), [b1, b2] = rank(cur);
    if (a1 > b1 || (a1 === b1 && a2 > b2)) lead.set(k, v);
  }
  const vendorsByChannel: Record<string, number> = {};
  for (const v of lead.values()) vendorsByChannel[channelOf(v)] = (vendorsByChannel[channelOf(v)] || 0) + 1;
  const servicesByChannel: Record<string, number> = {};
  for (const v of priced) servicesByChannel[channelOf(v)] = (servicesByChannel[channelOf(v)] || 0) + 1;
  const indexed = priced.filter((v) => statusOf(v) === "active");
  const vendorKeys = new Set(priced.map(keyOf));
  const indexedKeys = new Set(indexed.map(keyOf));

  // Distribution per modality + unit + direction.
  const groups = new Map<string, number[]>();
  for (const s of skus) {
    const key = `${s.modality}|${s.normalized_price_unit}|${dirKey(s.direction)}`;
    const arr = groups.get(key) || [];
    arr.push(Number(s.normalized_price));
    groups.set(key, arr);
  }
  const distribution = [...groups.entries()]
    .map(([key, prices]) => {
      const [modality, unit, direction] = key.split("|");
      prices.sort((a, b) => a - b);
      return {
        modality,
        unit,
        direction,
        skus: prices.length,
        p25: quantile(prices, 0.25),
        median: quantile(prices, 0.5),
        p75: quantile(prices, 0.75),
        min: prices[0],
        max: prices[prices.length - 1],
      };
    })
    .filter((g) => g.skus >= 20)
    .sort((a, b) => b.skus - a.skus);

  const modalities: Record<string, number> = {};
  for (const s of allSkus) modalities[s.modality] = (modalities[s.modality] || 0) + 1;

  const body: Record<string, unknown> = {
    published_week: gate,
    coverage: {
      vendors: vendorKeys.size,
      pricing_services: priced.length,
      vendors_in_published_indexes: indexedKeys.size,
      pricing_services_in_published_indexes: indexed.length,
      vendors_tracked_not_yet_indexed: vendorKeys.size - indexedKeys.size,
      vendors_by_channel: vendorsByChannel,
      pricing_services_by_channel: servicesByChannel,
      countries: new Set(priced.map((v) => v.country).filter(Boolean)).size,
      models: new Set(allSkus.map((s) => anchorBy.get(s.model_id) || s.model_id)).size,
      priced_skus: allSkus.length,
      usd_priced_skus: skus.length,
      published_indexes: indexes.length,
    },
    skus_by_modality: modalities,
    price_distribution: distribution,
    note: "Prices are in each group's own unit (per 1,000 tokens for token models). Distributions cover USD-quoted SKUs only; SKUs of services quoted in other currencies (tracked, no published index yet) are counted in coverage. A vendor is a company; a pricing service is one price list, and some vendors publish several (for example a cloud's separate AI services, or a separate list for mainland China). Vendors are tracked weekly; those quoting only in a currency with no published index yet are tracked but not in an index. Groups with fewer than 20 SKUs are left out.",
  };

  if (tier === "paid") {
    const perVendor: Record<string, number> = {};
    for (const s of allSkus) perVendor[s.vendor_id] = (perVendor[s.vendor_id] || 0) + 1;
    body.skus_by_vendor = Object.fromEntries(Object.entries(perVendor).sort((a, b) => b[1] - a[1]));
    return respond("get_market_stats", tier, body);
  }

  body.upgrade = UPGRADE_MESSAGE;
  return respond("get_market_stats", tier, body, "The vendor-by-vendor breakdown of the market");
}

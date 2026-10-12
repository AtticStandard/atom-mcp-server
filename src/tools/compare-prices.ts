// ============================================================
// Tool: compare_prices
// The same model priced across every vendor that sells it,
// cheapest first, with spreads computed per direction.
// ============================================================

import { z } from "zod";
import { enc, inList, queryAll, queryPublishedPrices, queryTable } from "../supabase.js";
import { CHANNEL_LABELS, UPGRADE_MESSAGE } from "../config.js";
import { anchorOf, dirKey, errorResult, expandAnchors, findModels, respond, vendorLookup } from "../util.js";
import type { Tier } from "../types.js";

export const comparePricesSchema = {
  model_name: z.string().optional().describe("Model to compare, e.g. 'GPT-4o', 'Llama 3.3 70B', 'DeepSeek V3'"),
  model_family: z.string().optional().describe("Whole family instead of one model, e.g. 'Llama', 'Qwen'"),
  direction: z.enum(["Input", "Output", "Cached Input"]).optional().describe("Pricing direction"),
  limit: z.coerce.number().int().min(1).max(200).default(50).describe("Maximum SKUs (default 50)"),
};

export async function handleComparePrices(params: z.infer<z.ZodObject<typeof comparePricesSchema>>, tier: Tier) {
  if (!params.model_name && !params.model_family)
    return errorResult("compare_prices", "Give a model_name or a model_family to compare.");

  let anchors: string[] = [];
  let matched: string[] = [];
  if (params.model_name) {
    const models = await findModels(params.model_name, 5);
    if (models.length > 0) {
      anchors = [anchorOf(models[0])];
      matched = [models[0].model_name];
    }
  } else {
    const fam = await queryTable<{ model_id: string; canonical_model_id: string | null; model_name: string }>(
      "model_registry",
      [`model_family=ilike.*${enc(params.model_family!)}*`],
      { select: "model_id,canonical_model_id,model_name", limit: 2000 }
    );
    anchors = [...new Set(fam.map(anchorOf))];
    matched = [...new Set(fam.map((m) => m.model_name))].slice(0, 25);
  }
  if (anchors.length === 0)
    return errorResult("compare_prices", `No model matches '${params.model_name || params.model_family}'.`);

  const ids = await expandAnchors(anchors);
  const filters = ["normalized_price=gt.0"];
  if (params.direction) filters.push(`direction=eq.${enc(params.direction)}`);

  const skus: Record<string, any>[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    skus.push(
      ...(await queryPublishedPrices<Record<string, any>>([...filters, `model_id=${inList(ids.slice(i, i + 150))}`], {
        select: "sku_id,vendor_id,vendor_name,model_id,model_name,modality,direction,normalized_price,normalized_price_unit,billing_method",
        order: "sku_id.asc",
      }))
    );
  }
  if (skus.length === 0)
    return errorResult("compare_prices", `No current prices for '${params.model_name || params.model_family}'.`);

  const vendors = await vendorLookup();
  for (const s of skus) {
    const t = vendors.get(s.vendor_id)?.vendor_type || null;
    s.channel = t ? CHANNEL_LABELS[t] || t : null;
  }

  // Per direction and unit: spread and vendor count.
  const groups = new Map<string, Record<string, any>[]>();
  for (const s of skus) {
    const k = `${dirKey(s.direction)}|${s.normalized_price_unit}`;
    groups.set(k, [...(groups.get(k) || []), s]);
  }
  const by_direction = [...groups.entries()].map(([k, rows]) => {
    const [direction, unit] = k.split("|");
    rows.sort((a, b) => a.normalized_price - b.normalized_price);
    const lo = rows[0].normalized_price;
    const hi = rows[rows.length - 1].normalized_price;
    const summary = {
      direction,
      unit,
      skus: rows.length,
      vendors: new Set(rows.map((r) => r.vendor_id)).size,
      cheapest: lo,
      dearest: hi,
      spread_ratio: lo > 0 ? Math.round((hi / lo) * 100) / 100 : null,
    };
    return tier === "paid"
      ? { ...summary, offers: rows.slice(0, params.limit) }
      : summary;
  });

  return respond(
    "compare_prices",
    tier,
    {
      query: { model_name: params.model_name, model_family: params.model_family, direction: params.direction },
      matched_models: matched,
      by_direction,
      ...(tier === "paid" ? {} : { upgrade: UPGRADE_MESSAGE }),
    },
    "The vendor-by-vendor price comparison"
  );
}

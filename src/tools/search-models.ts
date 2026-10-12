// ============================================================
// Tool: search_models
// Multi-filter search across every priced SKU. Model filters
// (creator, tier, license, origin, reasoning, context) are read
// from the model's anchor, so aliases are found too.
// ============================================================

import { z } from "zod";
import { enc, queryAll, queryPublishedPrices } from "../supabase.js";
import { CHANNEL_LABELS } from "../config.js";
import { gateResults } from "../auth.js";
import { anchorOf, respond, vendorLookup } from "../util.js";
import type { Tier, ModelRegistry } from "../types.js";

export const searchModelsSchema = {
  modality: z.string().optional().describe("Text, Multimodal, Image, Video, Audio, Voice"),
  vendor: z.string().optional().describe("Vendor name or id"),
  channel: z.string().optional().describe("'Model developer', 'Cloud marketplace', 'Inference platform' or 'Neocloud'"),
  creator: z.string().optional().describe("Model creator (the lab that built the model)"),
  model_family: z.string().optional().describe("Model family, e.g. 'Llama', 'Qwen', 'Claude'"),
  tier: z.string().optional().describe("Lineup tier: 'Flagship', 'Core' or 'Compact'"),
  license: z.string().optional().describe("License class, e.g. 'open', 'restricted', 'proprietary'"),
  origin: z.string().optional().describe("Creator's home country, e.g. 'United States', 'China'"),
  reasoning: z.string().optional().describe("'true' for reasoning models only, 'false' to exclude them"),
  open_source: z.string().optional().describe("'true' for models with published weights"),
  direction: z.enum(["Input", "Output", "Cached Input"]).optional().describe("Pricing direction"),
  max_price: z.coerce.number().optional().describe("Maximum price in the SKU's own unit (per 1,000 tokens for token models)"),
  min_context_window: z.coerce.number().int().optional().describe("Minimum context window in tokens"),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Results to return (default 20)"),
  offset: z.coerce.number().int().min(0).default(0).describe("Offset for paging"),
};

const TIER_CODES: Record<string, string[]> = {
  flagship: ["FLG", "FTR", "Flagship", "Frontier"],
  core: ["COR", "MID", "Core", "Mid"],
  compact: ["CMP", "BDG", "Compact", "Budget"],
};

export async function handleSearchModels(params: z.infer<z.ZodObject<typeof searchModelsSchema>>, tier: Tier) {
  const skuFilters = ["normalized_price=gt.0"];
  if (params.modality) skuFilters.push(`modality=ilike.*${enc(params.modality)}*`);
  if (params.vendor) skuFilters.push(`vendor_name=ilike.*${enc(params.vendor)}*`);
  if (params.direction) skuFilters.push(`direction=eq.${enc(params.direction)}`);
  if (params.max_price !== undefined) skuFilters.push(`normalized_price=lte.${params.max_price}`);

  let skus = await queryPublishedPrices<Record<string, any>>(skuFilters, {
    select:
      "sku_id,model_id,vendor_id,vendor_name,model_name,modality,modality_subtype,direction,normalized_price,normalized_price_unit,billing_method",
    order: "normalized_price.asc,sku_id.asc",
  });

  // Channel filter via vendor registry.
  if (params.channel) {
    const c = params.channel.trim().toLowerCase();
    const vendors = await vendorLookup();
    const keep = new Set(
      [...vendors.entries()]
        .filter(([, v]) => {
          const code = String(v.vendor_type || "").toLowerCase();
          const label = (CHANNEL_LABELS[v.vendor_type || ""] || "").toLowerCase();
          return code === c || label.includes(c);
        })
        .map(([id]) => id)
    );
    skus = skus.filter((s) => keep.has(s.vendor_id));
  }

  // Model filters via registry anchors.
  const modelFilter =
    params.creator || params.model_family || params.tier || params.license || params.origin ||
    params.reasoning || params.open_source || params.min_context_window;
  if (modelFilter) {
    const registry = await queryAll<ModelRegistry>("model_registry", [], {
      select:
        "model_id,canonical_model_id,creator,model_family,tier,license_class,license_type,creator_country,is_reasoning,open_source,context_window",
      order: "model_id.asc",
    });
    const byId = new Map(registry.map((m) => [m.model_id, m]));
    const has = (v: unknown, q?: string) => !q || String(v ?? "").toLowerCase().includes(q.toLowerCase());
    const tierCodes = params.tier ? TIER_CODES[params.tier.toLowerCase()] || [params.tier] : null;

    skus = skus.filter((s) => {
      const own = byId.get(s.model_id);
      if (!own) return false;
      const m = byId.get(anchorOf(own)) || own;
      if (!has(m.creator, params.creator)) return false;
      if (!has(m.model_family, params.model_family)) return false;
      if (!has(m.license_class ?? m.license_type, params.license)) return false;
      if (!has(m.creator_country, params.origin)) return false;
      if (tierCodes && !tierCodes.some((t) => String(m.tier || "").toLowerCase() === t.toLowerCase())) return false;
      if (params.reasoning !== undefined && params.reasoning !== "" && !!m.is_reasoning !== (params.reasoning === "true")) return false;
      if (params.open_source !== undefined && params.open_source !== "" && !!m.open_source !== (params.open_source === "true")) return false;
      if (params.min_context_window && !((m.context_window || 0) >= params.min_context_window)) return false;
      return true;
    });
  }

  const page = skus.slice(params.offset, params.offset + params.limit);

  return respond(
    "search_models",
    tier,
    {
      filters: Object.fromEntries(Object.entries(params).filter(([k, v]) => v !== undefined && k !== "_atom_api_key")),
      total_results: skus.length,
      showing: page.length,
      results: gateResults(page, tier),
    },
    "The full list of matching models with vendors and prices"
  );
}

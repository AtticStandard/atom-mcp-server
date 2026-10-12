// ============================================================
// Tool: get_vendor_catalog
// Everything one vendor sells, with prices (PRO) or a summary.
// ============================================================

import { z } from "zod";
import { enc, queryAll, queryPublishedPrices } from "../supabase.js";
import { CHANNEL_LABELS } from "../config.js";
import { gateResults } from "../auth.js";
import { errorResult, respond } from "../util.js";
import type { Tier, VendorRegistry } from "../types.js";

export const getVendorCatalogSchema = {
  vendor: z.string().describe("Vendor name or id, as listed by list_vendors"),
  modality: z.string().optional().describe("Optional modality: Text, Multimodal, Image, Video, Audio, Voice"),
  direction: z.enum(["Input", "Output", "Cached Input"]).optional().describe("Optional pricing direction"),
  limit: z.coerce.number().int().min(1).max(500).default(100).describe("Maximum SKUs (default 100)"),
};

export async function handleGetVendorCatalog(params: z.infer<z.ZodObject<typeof getVendorCatalogSchema>>, tier: Tier) {
  const term = params.vendor.trim().toLowerCase();
  const all = await queryAll<VendorRegistry>("vendor_registry", [], {
    select: "vendor_id,vendor_name,vendor_type,parent_vendor,country,region,vendor_url,pricing_page_url,status",
    order: "vendor_name.asc",
  });
  const vendor =
    all.find((v) => v.vendor_id.toLowerCase() === term || v.vendor_name.toLowerCase() === term) ||
    all
      .filter((v) => v.vendor_name.toLowerCase().includes(term) || v.vendor_id.toLowerCase().includes(term))
      .sort((a, b) => a.vendor_name.length - b.vendor_name.length)[0];
  if (!vendor) return errorResult("get_vendor_catalog", `No vendor matches '${params.vendor}'. Use list_vendors to see the fleet.`);

  const filters = [`vendor_id=eq.${enc(vendor.vendor_id)}`, "normalized_price=gt.0"];
  if (params.modality) filters.push(`modality=ilike.*${enc(params.modality)}*`);
  if (params.direction) filters.push(`direction=eq.${enc(params.direction)}`);

  const skus = await queryPublishedPrices<Record<string, any>>(filters, {
    select: "sku_id,model_id,model_name,modality,modality_subtype,direction,normalized_price,normalized_price_unit,billing_method",
    order: "model_name.asc,direction.asc",
  });

  const summary = {
    vendor_name: vendor.vendor_name,
    channel: CHANNEL_LABELS[vendor.vendor_type || ""] || vendor.vendor_type,
    parent: vendor.parent_vendor || undefined,
    country: vendor.country,
    region: vendor.region,
    pricing_page: vendor.pricing_page_url,
    website: vendor.vendor_url,
    models: new Set(skus.map((s) => s.model_id)).size,
    skus: skus.length,
    modalities: [...new Set(skus.map((s) => s.modality))],
  };

  return respond(
    "get_vendor_catalog",
    tier,
    {
      catalog: summary,
      skus: tier === "paid" ? skus.slice(0, params.limit) : gateResults(skus, tier),
      showing: tier === "paid" ? Math.min(params.limit, skus.length) : 0,
    },
    "This vendor's full price list"
  );
}

// ============================================================
// Tool: list_vendors
// Every vendor in the Attic Standard fleet with its channel.
// Tracked services quoted in a currency with no published index
// yet (status 'tracking') are listed too, marked as such.
// ============================================================

import { z } from "zod";
import { enc, queryAll } from "../supabase.js";
import { CHANNEL_LABELS } from "../config.js";
import { respond } from "../util.js";
import type { Tier, VendorRegistry } from "../types.js";

export const listVendorsSchema = {
  channel: z
    .string()
    .optional()
    .describe("Optional channel: 'Model developer' (DEV), 'Cloud marketplace' (CLD), 'Inference platform' (PLT), 'Neocloud' (NCL)"),
  region: z.string().optional().describe("Optional region, e.g. 'North America', 'Europe', 'Asia'"),
  country: z.string().optional().describe("Optional country, e.g. 'United States', 'China', 'France'"),
};

export async function handleListVendors(params: z.infer<z.ZodObject<typeof listVendorsSchema>>, tier: Tier) {
  const filters: string[] = [];
  if (params.region) filters.push(`region=ilike.*${enc(params.region)}*`);
  if (params.country) filters.push(`country=ilike.*${enc(params.country)}*`);

  let vendors = await queryAll<VendorRegistry>("vendor_registry", filters, {
    select: "vendor_id,vendor_name,vendor_type,parent_vendor,country,region,vendor_url,pricing_page_url,status,pricing_currency",
    order: "vendor_name.asc",
  });
  const tracked = (v: VendorRegistry) => {
    const s = String(v.status || "active").toLowerCase();
    return s === "active" || s === "tracking";
  };
  vendors = vendors.filter(tracked);

  if (params.channel) {
    const c = params.channel.trim().toLowerCase();
    vendors = vendors.filter((v) => {
      const code = String(v.vendor_type || "").toLowerCase();
      const label = (CHANNEL_LABELS[v.vendor_type || ""] || "").toLowerCase();
      return code === c || label.includes(c) || code.includes(c);
    });
  }

  const formatted = vendors.map((v) => ({
    vendor_id: v.vendor_id,
    name: v.vendor_name,
    channel: CHANNEL_LABELS[v.vendor_type || ""] || v.vendor_type,
    parent: v.parent_vendor || undefined,
    country: v.country,
    region: v.region,
    pricing_page: v.pricing_page_url,
    website: v.vendor_url,
    pricing_currency: v.pricing_currency || "USD",
    index_status:
      String(v.status || "").toLowerCase() === "tracking"
        ? "Tracked weekly; no published index in this currency yet"
        : "In published indexes",
  }));

  return respond("list_vendors", tier, { total: formatted.length, vendors: formatted });
}

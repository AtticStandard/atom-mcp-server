// ============================================================
// Tool: get_model_detail
// One model: specs from its anchor, index memberships, and its
// price at every vendor (PRO) or a per-direction summary (free).
// ============================================================

import { z } from "zod";
import { enc, inList, queryAll, queryPublishedPrices, queryTable } from "../supabase.js";
import { CHANNEL_LABELS, LICENSE_LABELS, TIER_LABELS } from "../config.js";
import { anchorOf, dirKey, errorResult, expandAnchors, findModels, MODEL_SELECT, respond, vendorLookup } from "../util.js";
import type { Tier, ModelRegistry } from "../types.js";

export const getModelDetailSchema = {
  model_name: z.string().describe("Model to look up, e.g. 'GPT-4o', 'Claude Sonnet 4.5', 'Llama 3.3 70B'"),
};

export async function handleGetModelDetail(params: z.infer<z.ZodObject<typeof getModelDetailSchema>>, tier: Tier) {
  const matches = await findModels(params.model_name, 8);
  if (matches.length === 0)
    return errorResult("get_model_detail", `No model matches '${params.model_name}'. Try a shorter name such as 'GPT-4' or 'Llama'.`);

  const anchorId = anchorOf(matches[0]);
  const anchorRows =
    anchorId === matches[0].model_id
      ? [matches[0]]
      : await queryTable<ModelRegistry>("model_registry", [`model_id=eq.${enc(anchorId)}`], { select: MODEL_SELECT, limit: 1 });
  const m = anchorRows[0] || matches[0];
  const ids = await expandAnchors([anchorId]);

  const [skus, membership, vendors] = await Promise.all([
    queryPublishedPrices<Record<string, any>>([`model_id=${inList(ids)}`, "normalized_price=gt.0"], {
      select: "sku_id,vendor_id,vendor_name,model_id,model_name,modality,modality_subtype,direction,normalized_price,normalized_price_unit,billing_method",
      order: "normalized_price.asc,sku_id.asc",
    }),
    queryAll<{ index_code: string }>("index_membership_snapshot", [`model_id=${inList(ids)}`, "in_basket=is.true"], {
      select: "index_code",
      order: "index_code.asc",
    }),
    vendorLookup(),
  ]);

  const specs = {
    anchor_model_id: m.model_id,
    model_name: m.model_name,
    creator: m.creator,
    origin: m.creator_country,
    family: m.model_family,
    tier: m.tier ? TIER_LABELS[m.tier] || m.tier : null,
    license: m.license_class ? LICENSE_LABELS[m.license_class] || m.license_class : m.license_type,
    open_weights: m.open_source,
    reasoning: m.is_reasoning,
    task: m.task_category,
    parameters: m.parameter_count,
    context_window: m.context_window,
    max_output_tokens: m.max_output_tokens,
    training_cutoff: m.training_cutoff,
    input_modalities: m.modality_input,
    output_modalities: m.modality_output,
    tool_calling: m.tool_calling,
    json_mode: m.json_mode,
    source: m.source_url,
    aliases: ids.length - 1,
  };

  for (const s of skus) {
    const t = vendors.get(s.vendor_id)?.vendor_type || null;
    s.channel = t ? CHANNEL_LABELS[t] || t : null;
  }

  const summary: Record<string, any> = {};
  for (const s of skus) {
    const k = `${dirKey(s.direction)} (${s.normalized_price_unit})`;
    const e = summary[k] || { skus: 0, vendors: new Set<string>(), cheapest: Infinity, highest: 0 };
    e.skus += 1;
    e.vendors.add(s.vendor_id);
    e.cheapest = Math.min(e.cheapest, s.normalized_price);
    e.highest = Math.max(e.highest, s.normalized_price);
    summary[k] = e;
  }
  for (const k of Object.keys(summary)) summary[k].vendors = summary[k].vendors.size;

  return respond(
    "get_model_detail",
    tier,
    {
      model: specs,
      in_indexes: [...new Set(membership.map((r) => r.index_code))],
      pricing_summary: summary,
      ...(tier === "paid" ? { offers: skus } : {}),
      other_matches: matches
        .slice(1)
        .map((x) => x.model_name)
        .filter((n) => n !== m.model_name),
    },
    "The price of this model at every vendor"
  );
}

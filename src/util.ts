// ============================================================
// Attic Standard MCP Server — Shared helpers
// ============================================================
import { inList, queryAll, queryTable } from "./supabase.js";
import { freeTierNote } from "./auth.js";
import { SITE } from "./config.js";
import type { Tier, ModelRegistry } from "./types.js";

type Content = { type: "text"; text: string };

/** Standard tool response: one JSON block, plus the upgrade note on free tier. */
export function respond(
  tool: string,
  tier: Tier,
  body: Record<string, unknown>,
  freeContext?: string
): { content: Content[] } {
  const content: Content[] = [
    {
      type: "text",
      text: JSON.stringify({ tool, tier, ...body, source: SITE }, null, 2),
    },
  ];
  if (tier === "free" && freeContext) content.push(freeTierNote(freeContext));
  return { content };
}

export function errorResult(tool: string, message: string): { content: Content[] } {
  return { content: [{ type: "text", text: JSON.stringify({ tool, error: message }, null, 2) }] };
}

/** Accepts "TXT", "txt", "AIPI TXT GLB" and returns the stored code "AIPI TXT GLB". */
export function normIndexCode(input: string): string {
  const s = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (/^[A-Z]{3}$/.test(s)) return `AIPI ${s} GLB`;
  if (/^AIPI [A-Z]{3}$/.test(s)) return `${s} GLB`;
  if (/^[A-Z]{3} (GLB|EUR|CNY)$/.test(s)) return `AIPI ${s}`;
  return s;
}

/** Quantile on a sorted numeric array (nearest rank, no interpolation). */
export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1) + 0.5)));
  return sorted[idx];
}

export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Normalise a direction label to input | cached | output. */
export function dirKey(direction: string | null | undefined): "input" | "cached" | "output" {
  const d = String(direction || "").toLowerCase();
  if (d.includes("cach")) return "cached";
  if (d.includes("out")) return "output";
  return "input";
}

export function round(n: number | null | undefined, dp = 2): number | null {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
  const f = Math.pow(10, dp);
  return Math.round(Number(n) * f) / f;
}

// ------------------------------------------------------------
// Model resolution: anchors and their aliases
// ------------------------------------------------------------

export const MODEL_SELECT =
  "model_id,model_name,model_family,creator,creator_country,open_source,license_type,license_class,tier,is_reasoning,task_category,parameter_count,context_window,max_output_tokens,training_cutoff,modality_input,modality_output,tool_calling,json_mode,streaming,source_url,canonical_model_id,last_verified";

/** The anchor id a registry row belongs to. */
export function anchorOf(m: Pick<ModelRegistry, "model_id" | "canonical_model_id">): string {
  return m.canonical_model_id || m.model_id;
}

/** Every model_id (anchor plus aliases) that belongs to the given anchors. */
export async function expandAnchors(anchorIds: string[]): Promise<string[]> {
  if (anchorIds.length === 0) return [];
  const ids = new Set<string>(anchorIds);
  for (let i = 0; i < anchorIds.length; i += 150) {
    const chunk = anchorIds.slice(i, i + 150);
    const aliases = await queryTable<{ model_id: string }>(
      "model_registry",
      [`canonical_model_id=${inList(chunk)}`],
      { select: "model_id", limit: 5000 }
    );
    aliases.forEach((a) => ids.add(a.model_id));
  }
  return [...ids];
}

/**
 * Find models by name. Exact name or id matches win; otherwise a
 * partial match. Returns registry rows, anchors first.
 */
export async function findModels(name: string, limit = 25): Promise<ModelRegistry[]> {
  const term = name.trim().replace(/["()]/g, "");
  const q = (v: string) => encodeURIComponent(`"${v}"`);
  const exact = await queryTable<ModelRegistry>(
    "model_registry",
    [`or=(model_name.ilike.${q(term)},model_id.ilike.${q(term)})`],
    { select: MODEL_SELECT, limit }
  );
  const rows =
    exact.length > 0
      ? exact
      : await queryTable<ModelRegistry>(
          "model_registry",
          [`or=(model_name.ilike.${q(`*${term}*`)},model_id.ilike.${q(`*${term}*`)})`],
          { select: MODEL_SELECT, limit: 200 }
        );
  const isAnchor = (m: ModelRegistry) => !m.canonical_model_id || m.canonical_model_id === m.model_id;
  return rows
    .sort((a, b) => {
      if (isAnchor(a) !== isAnchor(b)) return isAnchor(a) ? -1 : 1;
      return (a.model_name || "").length - (b.model_name || "").length;
    })
    .slice(0, limit);
}

/** Load a vendor lookup: vendor_id -> {name, channel, country}. */
export async function vendorLookup(): Promise<
  Map<string, { vendor_name: string; vendor_type: string | null; country: string | null; status: string | null }>
> {
  const rows = await queryAll<{
    vendor_id: string;
    vendor_name: string;
    vendor_type: string | null;
    country: string | null;
    status: string | null;
  }>("vendor_registry", [], { select: "vendor_id,vendor_name,vendor_type,country,status", order: "vendor_id.asc" });
  return new Map(rows.map((r) => [r.vendor_id, r]));
}

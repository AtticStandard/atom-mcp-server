// ============================================================
// Attic Standard MCP Server — Brand and product constants
// ============================================================
// One place for every name, link and price the server prints.
// Technical identifiers (repo, npm package, Railway URL and the
// _atom_api_key field) keep their original names so existing
// connections and directory listings keep working.
// ============================================================

export const SERVER_NAME = "attic-standard-mcp";
export const SERVER_VERSION = "2.1.0";

export const BRAND = "Attic Standard";
export const PRO_NAME = "Attic Standard MCP PRO";
export const PRO_PRICE = "$500/month";
export const SITE = "https://atticstandard.com";
export const MCP_PAGE = `${SITE}/mcp`;
export const METHODOLOGY_PAGE = `${SITE}/methodology`;

/** Public icon served by this server (assets/icon.png). */
export const ICON_PATH = "/favicon.png";
export const PUBLIC_URL = "https://mcp.atticstandard.com";

export const UPGRADE_LABEL = `[${PRO_NAME}]`;
export const UPGRADE_MESSAGE = `Vendor names, model names and SKU-level prices are available in ${PRO_NAME} (${PRO_PRICE}). ${MCP_PAGE}`;

export const INDEX_FAMILIES = [
  "Modality",
  "Channel",
  "Tier",
  "License",
  "Origin",
  "Use case",
] as const;

/** Readable names for the channel codes stored in vendor_registry.vendor_type. */
export const CHANNEL_LABELS: Record<string, string> = {
  DEV: "Model developer",
  CLD: "Cloud marketplace",
  PLT: "Inference platform",
  NCL: "Neocloud",
};

/** Published tier names for the tier codes stored in model_registry.tier. */
export const TIER_LABELS: Record<string, string> = {
  FLG: "Flagship", FTR: "Flagship",
  COR: "Core", MID: "Core",
  CMP: "Compact", BDG: "Compact",
};

/** Published names for model_registry.license_class. */
export const LICENSE_LABELS: Record<string, string> = {
  open: "Open weights, permissive license",
  "open-weight": "Open weights, restricted license",
  "non-commercial": "Non-commercial license",
  proprietary: "Proprietary",
};

/** Market KPI definitions, keyed by kpi_market_snapshot.kpi_code (methodology section 4.2). */
export const MARKET_KPIS: Record<string, { label: string; group: string; definition: string }> = {
  output_premium: { label: "Output premium", group: "Price structure",
    definition: "The share of token models whose output rate is more than four times their input rate." },
  caching_discount: { label: "Caching discount", group: "Price structure",
    definition: "The median saving of cached input against the same model's standard input rate, across models sold with both." },
  caching_availability: { label: "Caching availability", group: "Price structure",
    definition: "The share of token models sold with a cached input rate by at least one company." },
  repricing_activity: { label: "Repricing activity", group: "Price dynamics",
    definition: "The share of listings present now and thirteen weeks earlier whose price made a lasting change in between, with the share of those changes that were cuts." },
  repricing_depth: { label: "Repricing depth", group: "Price dynamics",
    definition: "The median size of the lasting price changes made over the last thirteen weeks." },
  post_launch_drift: { label: "Post-launch drift", group: "Price dynamics",
    definition: "The share of models launched four to thirteen weeks ago whose market price is now below their launch week." },
  multivendor_spread: { label: "Multi-vendor spread", group: "Competition",
    definition: "For models sold by two or more companies, the median ratio of the dearest company's input price to the cheapest's." },
  first_party_premium: { label: "First-party premium", group: "Competition",
    definition: "The share of models priced higher by their creator than by the median independent host, an inference platform or neocloud selling the same model." },
  marketplace_premium: { label: "Marketplace premium", group: "Competition",
    definition: "The share of models priced higher on a cloud marketplace than by the median independent host selling the same model." },
};

export const BASE_MONTH = "2026-05";
export const BASE_MONTH_END = "2026-06-01";

export const BENCHMARK_NOTE =
  "Benchmark: the chained level, expressed as May 2026 = 100 (the average of that month's weeks); it moves only when models present in consecutive weeks are repriced, and each model joins from its second priced week. " +
  "Spot: what the market charges this week, in dollars; each model is taken at the median of its vendors' prices, and the spot is the median across those models, with the 25th and 75th percentiles. " +
  "Spot changes are measured against the spot's own May 2026 average, four published weeks back and one week back, so they reflect models arriving and leaving as well as repricing. " +
  "Where a basket averaged fewer than 15 models in May 2026, or today's count differs from that average by more than half, changed_since_base is true: read spot changes with that in view.";

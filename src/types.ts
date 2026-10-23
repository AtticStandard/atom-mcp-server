// ============================================================
// Attic Standard MCP Server — Type Definitions
// ============================================================

/** Access tier for API consumers */
export type Tier = "free" | "paid";

/** Supabase query response wrapper */
export interface SupabaseResponse<T> {
  data: T[] | null;
  error: string | null;
  count?: number;
}

// ------------------------------------------------------------
// Database table types (mirror Supabase schema)
// ------------------------------------------------------------

export interface VendorRegistry {
  vendor_id: string;
  vendor_name: string;
  country: string;
  region: string;
  vendor_url: string | null;
  pricing_page_url: string | null;
  model_specifications_url: string | null;
  vendor_type: string | null;
  parent_vendor: string | null;
  status: string | null;
  pricing_currency?: string | null;
}

export interface ModelRegistry {
  model_id: string;
  model_name: string;
  creator: string;
  model_family: string | null;
  modality_input: string[] | null;
  modality_output: string[] | null;
  open_source: boolean | null;
  parameter_count: string | null;
  context_window: number | null;
  max_output_tokens: number | null;
  tool_calling: boolean | null;
  json_mode: boolean | null;
  streaming: boolean | null;
  training_cutoff: string | null;
  source_url: string | null;
  null_reasons: Record<string, string> | null;
  last_verified: string | null;
  tier: string | null;
  license_type: string | null;
  license_class: string | null;
  canonical_model_id: string | null;
  is_reasoning: boolean | null;
  creator_country: string | null;
  task_category: string | null;
}

export interface SkuIndex {
  sku_id: string;
  sku_plan_name: string | null;
  model_id: string;
  vendor_id: string;
  vendor_name: string;
  model_name: string;
  modality: string;
  modality_subtype: string;
  direction: string;
  normalized_price: number | null;
  normalized_price_unit: string | null;
  price_normalization_method: string | null;
  original_price: string | null;
  billing_method: string | null;
  delivery_method: string | null;
  pricing_notes: string | null;
  verification_date: string | null;
  run_id: string | null;
}

export interface PriceIndex {
  id: number;
  sku_id: string;
  vendor_id: string;
  model_id: string;
  vendor_name: string;
  sku_plan_name: string | null;
  model_name: string;
  modality: string;
  modality_subtype: string;
  direction: string;
  original_price: string | null;
  normalized_price: number | null;
  normalized_price_unit: string | null;
  price_normalization_method: string | null;
  verification_date: string | null;
  billing_method: string | null;
  delivery_method: string | null;
  pricing_notes: string | null;
  run_id: string;
}

export interface IndexValues {
  id: number;
  index_code: string;
  index_category: string;
  index_description: string;
  unit: string;
  date: string;
  input_price: number | null;
  cached_price: number | null;
  output_price: number | null;
  sku_count: number;
  created_at: string;
}

// ------------------------------------------------------------
// View types
// ------------------------------------------------------------

/** v_summary_stats returns rows of {metric, value} */
export interface SummaryStatRow {
  metric: string;
  value: string;
}

/** v_pricing_intel KPI rows */
export interface PricingIntel {
  kpi_name: string;
  kpi_value: number;
  kpi_unit: string;
  kpi_description: string;
}

// ------------------------------------------------------------
// Tool response helpers
// ------------------------------------------------------------

export interface ToolContext {
  tier: Tier;
  apiKey?: string;
}

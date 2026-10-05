// ============================================================
// Attic Standard MCP Server — Tool registration
// ============================================================
// Eleven tools. Each handler resolves the caller's tier from the
// key passed in _atom_api_key (name kept for existing clients).
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveTier } from "./auth.js";
import { SERVER_NAME, SERVER_VERSION, PRO_NAME, PRO_PRICE, MCP_PAGE, SITE, PUBLIC_URL, ICON_PATH } from "./config.js";
import type { Tier } from "./types.js";

import { getIndexBenchmarksSchema, handleGetIndexBenchmarks } from "./tools/get-index-benchmarks.js";
import { getPriceHistorySchema, handleGetPriceHistory } from "./tools/get-price-history.js";
import { getIndexConstituentsSchema, handleGetIndexConstituents } from "./tools/get-index-constituents.js";
import { getKpisSchema, handleGetKpis } from "./tools/get-kpis.js";
import { getModelIntelligenceSchema, handleGetModelIntelligence } from "./tools/get-model-intelligence.js";
import { getMarketStatsSchema, handleGetMarketStats } from "./tools/get-market-stats.js";
import { listVendorsSchema, handleListVendors } from "./tools/list-vendors.js";
import { searchModelsSchema, handleSearchModels } from "./tools/search-models.js";
import { getModelDetailSchema, handleGetModelDetail } from "./tools/get-model-detail.js";
import { comparePricesSchema, handleComparePrices } from "./tools/compare-prices.js";
import { getVendorCatalogSchema, handleGetVendorCatalog } from "./tools/get-vendor-catalog.js";

const apiKeyField = {
  _atom_api_key: z
    .string()
    .optional()
    .describe(`Your ${PRO_NAME} key for vendor- and SKU-level data. Omit for the free tier.`),
};

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const FREE = "Free: fully public, the same figures atticstandard.com publishes.";
const TIERED = `Free tier returns counts, ranges and redacted samples; ${PRO_NAME} (${PRO_PRICE}, ${MCP_PAGE}) returns vendor names, model names and exact prices.`;
const UNITS = "Token prices are per 1,000 tokens; other modalities use their own unit (per image, per second, per minute, per 1,000 characters).";

type Handler = (params: any, tier: Tier) => Promise<any>;

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    title: "Attic Standard MCP",
    version: SERVER_VERSION,
    websiteUrl: SITE,
    icons: [{ src: `${PUBLIC_URL}${ICON_PATH}`, mimeType: "image/png", sizes: ["256x256"] }],
  });

  const add = (name: string, title: string, description: string, schema: Record<string, z.ZodTypeAny>, handler: Handler) => {
    server.registerTool(
      name,
      { title, description, inputSchema: { ...schema, ...apiKeyField }, annotations: readOnly },
      async (params: any) => {
        const tier = await resolveTier(params._atom_api_key);
        try {
          return await handler(params, tier);
        } catch (err) {
          console.error(`MCP tool ${name} failed:`, err);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ tool: name, error: "This tool could not read the data just now. Please try again shortly." }) }],
            isError: true,
          };
        }
      }
    );
  };

  // ---------------- Published layer (free) ----------------

  add(
    "get_index_benchmarks",
    "Attic Standard index benchmarks",
    `The Attic Standard price indexes for AI inference: every published index at the week the site shows.

Six families: Modality (text, multimodal, image, video, audio, voice, embeddings), Channel (model developers, cloud marketplaces, inference platforms, neoclouds), Tier (flagship, core, compact), License (open weights, restricted weights, proprietary), Origin (United States, China) and Use case (reasoning, coding).

For each index and direction (input, cached input, output) it returns the benchmark level (May 2026 = 100) with week, month and vs-base changes, the spot price (median, p25, p75 in dollars) with its own week, month and vs-base changes, and coverage counts with the May 2026 basket size, flagged where the basket has changed materially since the base.

${FREE} ${UNITS}

Examples:
  - "Where is text inference priced this week?" -> index_code="TXT"
  - "Compare the four channels" -> index_category="Channel"
  - "Open-weight versus proprietary" -> index_category="License"`,
    getIndexBenchmarksSchema,
    handleGetIndexBenchmarks
  );

  add(
    "get_price_history",
    "Price history",
    `Weekly history. With index_code: the index series (benchmark level, May 2026 = 100, and the spot price with its 25th and 75th percentiles) for up to 260 weeks; free. With model_name: every vendor's price for that model week by week, showing when each SKU was repriced; ${PRO_NAME}.

${UNITS}

Examples:
  - "How has the neocloud index moved since May?" -> index_code="NCL"
  - "Has anyone cut the price of DeepSeek V3 this quarter?" -> model_name="DeepSeek V3", weeks=13`,
    getPriceHistorySchema,
    handleGetPriceHistory
  );

  add(
    "get_kpis",
    "Market KPIs",
    `The nine market KPIs Attic Standard publishes each week.
- Price structure: output premium, caching discount, caching availability
- Price dynamics: repricing activity, repricing depth, post-launch drift
- Competition: multi-vendor spread, first-party premium, marketplace premium

Each KPI returns its value, interquartile range, population, week, month and vs-base changes, and its published definition. ${FREE}`,
    getKpisSchema,
    handleGetKpis
  );

  add(
    "get_model_intelligence",
    "Model intelligence",
    `Six capability and coverage measures drawn from the metadata behind every tracked model: reasoning tier share, long-context saturation, frontier context ceiling, output ceiling spread, training cutoff lag and vendor modality breadth. Read alongside the market KPIs, they explain why models are priced the way they are. ${FREE}`,
    getModelIntelligenceSchema,
    handleGetModelIntelligence
  );

  add(
    "get_index_constituents",
    "Index basket",
    `What sits inside an index basket this week. Free tier: the composition (SKUs, models and vendors, split by channel, origin, tier and license). ${PRO_NAME}: the model-by-model basket with the vendors selling each model.

Examples:
  - "What is in the flagship index?" -> index_code="FLG"
  - "How much of the China index is sold through neoclouds?" -> index_code="CHN"`,
    getIndexConstituentsSchema,
    handleGetIndexConstituents
  );

  add(
    "get_market_stats",
    "Market coverage and price distribution",
    `Coverage of the tracked market (active vendors by channel, countries, models, priced SKUs, published indexes) and price distributions split by modality, unit and direction. ${TIERED} ${UNITS}`,
    getMarketStatsSchema,
    handleGetMarketStats
  );

  add(
    "list_vendors",
    "List vendors",
    `Every vendor in the Attic Standard fleet with its channel (model developer, cloud marketplace, inference platform or neocloud), country, region and pricing page. Filter by channel, region or country.`,
    listVendorsSchema,
    handleListVendors
  );

  // ---------------- SKU and vendor layer (tiered) ----------------

  add(
    "search_models",
    "Search models and prices",
    `Search every priced SKU by modality, vendor, channel, creator, family, tier, license, origin, reasoning, open weights, direction, maximum price and minimum context window. Cheapest first. ${TIERED} ${UNITS}

Examples:
  - "Open-weight text models under $0.0005 per 1,000 output tokens" -> open_source="true", modality="Text", direction="Output", max_price=0.0005
  - "Chinese reasoning models on neoclouds" -> origin="China", reasoning="true", channel="Neocloud"`,
    searchModelsSchema,
    handleSearchModels
  );

  add(
    "get_model_detail",
    "Model detail",
    `One model in depth: specs (creator, origin, tier, license, context window, output limit, training cutoff, modalities), the Attic Standard indexes it belongs to, and its price at every vendor. ${TIERED}`,
    getModelDetailSchema,
    handleGetModelDetail
  );

  add(
    "compare_prices",
    "Compare prices across vendors",
    `The same model, or a whole family, priced across every vendor that sells it: cheapest and dearest offer, vendor count and spread ratio for each direction, plus each offer with its channel. ${TIERED} ${UNITS}

Examples:
  - "Cheapest place to run Llama 3.3 70B" -> model_name="Llama 3.3 70B"
  - "Qwen family output prices" -> model_family="Qwen", direction="Output"`,
    comparePricesSchema,
    handleComparePrices
  );

  add(
    "get_vendor_catalog",
    "Vendor catalog",
    `Everything one vendor sells: channel, country, pricing page, model and SKU counts, and the full price list. ${TIERED} ${UNITS}`,
    getVendorCatalogSchema,
    handleGetVendorCatalog
  );

  return server;
}

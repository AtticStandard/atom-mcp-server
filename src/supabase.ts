// ============================================================
// Attic Standard MCP Server — Supabase REST Client
// ============================================================
// Lightweight fetch-based client for Supabase PostgREST API.
// No Supabase JS SDK dependency — keeps the binary small.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL || "";
// Server-side key. The service role key is set only in the Railway
// environment and never leaves the server; the anon key is a fallback
// for local installs. Access is read-only (GET/RPC) and tier gating
// is enforced in this server before anything is returned.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "MCP: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set."
  );
}

/** URL-encode a user-supplied filter value so it cannot add PostgREST params. */
export function enc(value: string): string {
  return encodeURIComponent(String(value).trim()).replace(/%2A/g, "*");
}

const BASE = `${SUPABASE_URL}/rest/v1`;

const headers: Record<string, string> = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// ------------------------------------------------------------
// Generic query builder
// ------------------------------------------------------------

interface QueryOptions {
  table: string;
  select?: string;
  filters?: string[]; // PostgREST filter strings e.g. "vendor_id=eq.some_vendor"
  order?: string; // e.g. "normalized_price.asc"
  limit?: number;
  offset?: number;
  count?: "exact" | "planned" | "estimated";
}

export async function query<T>(opts: QueryOptions): Promise<{ data: T[]; count: number | null }> {
  const params = new URLSearchParams();

  if (opts.select) params.set("select", opts.select);
  if (opts.order) params.set("order", opts.order);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));

  let url = `${BASE}/${opts.table}?${params.toString()}`;

  // Append filters directly (PostgREST uses column=operator.value syntax)
  if (opts.filters && opts.filters.length > 0) {
    for (const f of opts.filters) {
      url += `&${f}`;
    }
  }

  const reqHeaders = { ...headers };
  if (opts.count) {
    reqHeaders["Prefer"] = `count=${opts.count}`;
  }

  const response = await fetch(url, { headers: reqHeaders });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase query failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as T[];
  const contentRange = response.headers.get("content-range");
  let count: number | null = null;
  if (contentRange) {
    const match = contentRange.match(/\/(\d+|\*)/);
    if (match && match[1] !== "*") {
      count = parseInt(match[1], 10);
    }
  }

  return { data, count };
}

// ------------------------------------------------------------
// RPC call helper (for Supabase functions / views)
// ------------------------------------------------------------

export async function rpc<T>(functionName: string, body?: Record<string, unknown>): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase RPC ${functionName} failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T[];
}

// ------------------------------------------------------------
// Convenience helpers for common tables
// ------------------------------------------------------------

export async function queryTable<T>(
  table: string,
  filters: string[] = [],
  options: Partial<QueryOptions> = {}
): Promise<T[]> {
  const result = await query<T>({
    table,
    filters,
    ...options,
  });
  return result.data;
}

/**
 * Read every matching row, page by page, so results are never cut
 * at the API's per-request row cap. Stops at maxRows.
 */
export async function queryAll<T>(
  table: string,
  filters: string[] = [],
  options: Partial<QueryOptions> = {},
  maxRows = 20000
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let offset = 0; offset < maxRows; offset += page) {
    const rows = await queryTable<T>(table, filters, { ...options, limit: page, offset });
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export async function queryView<T>(
  viewName: string,
  filters: string[] = [],
  options: Partial<QueryOptions> = {}
): Promise<T[]> {
  return queryTable<T>(viewName, filters, options);
}

// ------------------------------------------------------------
// Filter helpers
// ------------------------------------------------------------

/** PostgREST in-list with quoted, encoded values: in.("a","b"). */
export function inList(values: string[]): string {
  const quoted = values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",");
  return `in.(${encodeURIComponent(quoted)})`;
}

// ------------------------------------------------------------
// Publication gate (site_config.active_date, row id 1)
// ------------------------------------------------------------

let gateCache: { value: string | null; at: number } = { value: null, at: 0 };
const GATE_TTL = 5 * 60 * 1000;

/**
 * The published gate date the live site shows. Everything the server
 * returns is read at or before this date, so the MCP never shows a
 * week the site has not published yet.
 */
export async function getActiveDate(): Promise<string | null> {
  const now = Date.now();
  if (gateCache.value && now - gateCache.at < GATE_TTL) return gateCache.value;
  try {
    const rows = await queryTable<{ active_date: string }>("site_config", ["id=eq.1"], {
      select: "active_date",
    });
    const value = rows[0]?.active_date ? String(rows[0].active_date).slice(0, 10) : null;
    gateCache = { value, at: now };
    return value;
  } catch (err) {
    console.error("MCP: could not read site_config gate:", err);
    return gateCache.value;
  }
}

// ------------------------------------------------------------
// Published prices (price_index at the gate)
// ------------------------------------------------------------

/**
 * Current prices exactly as published: the price_index rows verified
 * on the gate date, the same snapshot the live site reads. sku_index
 * holds the newest scrape, which can run ahead of the published week,
 * so no tool reads current prices from it.
 */
export async function queryPublishedPrices<T>(
  filters: string[] = [],
  options: Partial<QueryOptions> = {},
  maxRows = 20000
): Promise<T[]> {
  const gate = await getActiveDate();
  if (!gate) throw new Error("Published gate date is unavailable; prices cannot be served.");
  return queryAll<T>("price_index", [`verification_date=eq.${gate}`, ...filters], options, maxRows);
}

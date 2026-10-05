<h1 align="center">Attic Standard MCP Server</h1>

<p align="center">
  <strong>The Global Price Benchmark for AI Inference, as a native tool for AI agents.</strong><br/>
  One number both sides trust.
</p>

<p align="center">
  <a href="https://atticstandard.com">Website</a> ·
  <a href="https://atticstandard.com/methodology">Methodology</a> ·
  <a href="https://atticstandard.com/mcp">MCP PRO</a>
</p>

---

## What this is

Attic Standard is the independent price reporting agency for AI inference. Every week it records the published prices of model developers, cloud marketplaces, inference platforms and neoclouds, and turns them into price indexes and market KPIs.

This server puts that data inside any MCP-compatible assistant (Claude, ChatGPT, Cursor, Windsurf, VS Code). Ask *"Where is text inference priced this week?"* or *"Cheapest place to run Llama 3.3 70B?"* and the assistant answers from the published benchmark instead of guessing.

---

## The indexes

23 published indexes in six families, each reported for input, cached input and output where the modality has them.

| Family | Indexes | What it answers |
|---|---|---|
| **Modality** | Text, Multimodal, Image (per image), Image (per megapixel), Video (per second), Video (per clip), Audio, Voice, Embeddings | What does this kind of inference cost? |
| **Channel** | Model developers, Cloud marketplaces, Inference platforms, Neoclouds | Where is it cheapest to buy? |
| **Tier** | Flagship, Core, Compact | What does a place higher in a maker's lineup cost? |
| **License** | Open weights, Restricted weights, Proprietary | What is the price of openness? |
| **Origin** | United States, China | How do the two model-building countries price? |
| **Use case** | Reasoning, Coding | What do specialist models cost? |

Each index carries two numbers:

- **Benchmark**: the chained level, May 2026 = 100 (the average of that month's weeks), with week, month and vs-base changes.
- **Spot**: what the market charges this week, in dollars. Each model is taken at the median of its vendors' prices, and the spot is the median across those models, with the interquartile range. Its change is stated against its own May 2026 average, month on month and week on week, and because the spot follows the market as it stands, that change reflects models arriving and leaving as well as repricing.

Token prices are per 1,000 tokens. Other modalities use their own unit.

---

## Tools

| Tool | Tier | What it returns |
|---|---|---|
| `get_index_benchmarks` | Free | Every published index at the current week: benchmark level and changes, spot price, range and changes, coverage with the May 2026 basket |
| `get_price_history` | Free / PRO | Weekly index series with the spot price and its range (free); week-by-week price of a model at every vendor, with each repricing (PRO) |
| `get_kpis` | Free | The nine market KPIs: output premium, caching discount, caching availability, repricing activity, repricing depth, post-launch drift, multi-vendor spread, first-party premium, marketplace premium |
| `get_model_intelligence` | Free | Six capability measures: reasoning tier share, long-context saturation, context ceiling, output ceiling spread, training cutoff lag, vendor modality breadth |
| `get_index_constituents` | Free / PRO | What is inside an index basket: composition by channel, origin, tier and license (free); model-by-model basket with vendors (PRO) |
| `get_market_stats` | Free / PRO | Coverage (vendors by channel, models, SKUs, indexes) and price distributions by modality, unit and direction; vendor breakdown on PRO |
| `list_vendors` | Free | The vendor fleet with channel, country and pricing page |
| `search_models` | Free / PRO | Search every priced SKU by modality, vendor, channel, creator, family, tier, license, origin, reasoning, price and context |
| `get_model_detail` | Free / PRO | One model's specs, the indexes it belongs to, and its price at every vendor |
| `compare_prices` | Free / PRO | One model or family across all vendors: cheapest, dearest and spread per direction, with every offer on PRO |
| `get_vendor_catalog` | Free / PRO | One vendor's channel, coverage and full price list |

---

## Free and PRO

| | Free | MCP PRO |
|---|---|---|
| Indexes, index history, market KPIs, model intelligence | Full | Full |
| Vendor list and market coverage | Full | Full |
| Index baskets | Composition counts | Model and vendor detail |
| Search, model detail, comparisons, catalogs, model price history | Counts, ranges, redacted samples | Vendor names, model names, exact prices |
| Price | $0 | $500/month |

The free tier carries everything atticstandard.com publishes. PRO adds the vendor- and SKU-level detail behind it. Subscribe at [atticstandard.com/mcp](https://atticstandard.com/mcp).

---

## Connect

### Claude (web and desktop)

Settings → Connectors → Add custom connector

```text
Name: Attic Standard
URL:  https://mcp.atticstandard.com/mcp
```

### Claude Desktop, Cursor, Windsurf (config file)

```json
{
  "mcpServers": {
    "attic-standard": {
      "url": "https://mcp.atticstandard.com/mcp"
    }
  }
}
```

If your client does not accept a remote URL, use the proxy:

```json
{
  "mcpServers": {
    "attic-standard": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.atticstandard.com/mcp"]
    }
  }
}
```

Connections made with the earlier address, `https://atom-mcp-server-production.up.railway.app/mcp`, keep working.

### PRO key

PRO subscribers receive a key. Tell your assistant to pass it as `_atom_api_key` on each call, or keep it in a project instruction such as *"Use my Attic Standard key XXXX for every Attic Standard tool call."*

---

## Example questions

- *"Where is text inference priced this week, and how has it moved since May?"*
- *"Compare the four distribution channels."*
- *"How much cheaper are open-weight models than proprietary ones?"*
- *"What share of models dropped in price after launch?"*
- *"What is inside the flagship index?"*
- *"Cheapest place to run DeepSeek V3, and who repriced it this quarter?"* (PRO)
- *"Everything one named vendor sells, with prices."* (PRO)

---

## Self-hosting

The hosted server above is the supported way to connect. The code is open so you can see exactly what it reads and how it gates data.

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Database URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (hosted) | Server-side database key, set only in the host's environment |
| `TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default 3000) |

Stack: TypeScript, Node.js, MCP SDK, Express, Zod, Supabase over REST.

---

## About

Attic Standard publishes the global price benchmark for AI inference: independent, methodology-led and updated weekly across the model developers, cloud marketplaces, inference platforms and neoclouds that sell inference. The name refers to the Attic silver-weight standard of the ancient Greek world, a common measure both sides of a trade accepted.

**Products:** [MCP](https://atticstandard.com/mcp) · [Terminal](https://atticstandard.com/terminal) · [Feed](https://atticstandard.com/feed)

Contact: info@atticstandard.com

## License

MIT

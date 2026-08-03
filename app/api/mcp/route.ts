import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getAllMetros, getMetroDetail } from "@/lib/data";
import { compareMetros, MAX_COMPARE_METROS } from "@/lib/compare";
import { DIMENSIONS } from "@/lib/methodology";
import { checkRateLimit } from "@/lib/rateLimit";

// MCP server for the Global Metro Power Rankings: lets an AI agent query
// the ranking data as typed tools instead of scraping HTML or guessing the
// JSON schema of /data/*.json. Free and unauthenticated, matching the
// existing llms.txt/robots.txt stance that welcomes AI crawlers to read,
// cite, and ingest this content for reference use.
//
// Every tool wraps the same lib/data.ts + lib/compare.ts + lib/methodology.ts
// logic that already powers /rankings/[slug], /compare, and /methodology —
// no separate data path to keep in sync.

export const runtime = "nodejs"; // lib/data.ts reads files via fs.readFileSync

const LIST_MAX = 200; // metros.json is 4,300+ rows / 1.66MB; never hand that whole file to a caller

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_metro",
      {
        title: "Get metro profile",
        description:
          "Full profile for one metro in the Global Metro Power Rankings: rank, score, all sixteen dimension values and ranks, teams, universities, culture, luxury hospitality, events, market cap, and more. Use search_metros first if you don't know the exact slug.",
        inputSchema: z.object({
          slug: z
            .string()
            .describe("URL slug for the metro, e.g. 'new-york', 'london', 'san-francisco-san-jose'"),
        }),
      },
      async ({ slug }) => {
        const detail = getMetroDetail(slug.trim().toLowerCase());
        if (!detail) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `No metro found for slug "${slug}". Use search_metros to find the correct slug.`,
              },
            ],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(detail) }] };
      },
    );

    server.registerTool(
      "list_top_metros",
      {
        title: "List top metros",
        description:
          `Ranked list of metros from the Global Metro Power Rankings composite (4,300+ metros total), optionally filtered by region or country. Returns lightweight summary rows (rank, slug, name, country, region, score, population) — call get_metro for full detail on any one metro. Capped at ${LIST_MAX} rows per call.`,
        inputSchema: z.object({
          n: z
            .number()
            .int()
            .min(1)
            .max(LIST_MAX)
            .default(25)
            .describe(`Number of metros to return, max ${LIST_MAX}`),
          region: z.string().optional().describe("Filter by region name, e.g. 'North America', 'Europe'"),
          country: z.string().optional().describe("Filter by country name, e.g. 'United States'"),
        }),
      },
      async ({ n, region, country }) => {
        let metros = getAllMetros();
        if (region) {
          const r = region.toLowerCase();
          metros = metros.filter((m) => m.region.toLowerCase() === r);
        }
        if (country) {
          const c = country.toLowerCase();
          metros = metros.filter((m) => m.country.toLowerCase() === c);
        }
        const rows = metros
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .slice(0, Math.min(n, LIST_MAX))
          .map((m) => ({
            rank: m.rank,
            slug: m.slug,
            name: m.name,
            country: m.country,
            region: m.region,
            score: m.score,
            pop: m.pop,
          }));
        return { content: [{ type: "text", text: JSON.stringify({ count: rows.length, metros: rows }) }] };
      },
    );

    server.registerTool(
      "search_metros",
      {
        title: "Search metros by name",
        description:
          "Case-insensitive search over metro name, primary city, and country. Use this to find a metro's exact slug before calling get_metro or compare_metros.",
        inputSchema: z.object({
          query: z.string().min(1).describe("Search text, e.g. 'san fran', 'brazil'"),
          limit: z.number().int().min(1).max(50).default(10),
        }),
      },
      async ({ query, limit }) => {
        const q = query.trim().toLowerCase();
        const matches = getAllMetros()
          .filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              m.primaryCity.toLowerCase().includes(q) ||
              m.country.toLowerCase().includes(q),
          )
          .sort((a, b) => a.rank - b.rank)
          .slice(0, limit)
          .map((m) => ({ rank: m.rank, slug: m.slug, name: m.name, country: m.country, region: m.region, score: m.score }));
        return { content: [{ type: "text", text: JSON.stringify({ count: matches.length, metros: matches }) }] };
      },
    );

    server.registerTool(
      "compare_metros",
      {
        title: "Compare metros",
        description: `Side-by-side comparison of two to ${MAX_COMPARE_METROS} metros across all sixteen scoring dimensions, with the leader in each dimension flagged.`,
        inputSchema: z.object({
          slugs: z
            .array(z.string())
            .min(2)
            .max(MAX_COMPARE_METROS)
            .describe(`2 to ${MAX_COMPARE_METROS} metro slugs to compare`),
        }),
      },
      async ({ slugs }) => {
        const result = compareMetros(slugs);
        if (result.metros.length === 0) {
          return {
            isError: true,
            content: [{ type: "text", text: `None of the requested slugs were found: ${slugs.join(", ")}` }],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    );

    server.registerTool(
      "get_methodology",
      {
        title: "Get scoring methodology",
        description:
          "The sixteen weighted dimensions behind the Global Metro Power Rankings composite score: what each measures, its weight/shape in the formula, and its upstream data source.",
        inputSchema: z.object({}),
      },
      async () => {
        return { content: [{ type: "text", text: JSON.stringify({ dimensions: DIMENSIONS }) }] };
      },
    );
  },
  { serverInfo: { name: "global-metro-power-rankings", version: "1.0.0" } },
);

// x-real-ip is set once by the edge and can't be appended to by the client,
// so it's the trustworthy value when present. x-forwarded-for is a hop chain
// a client can prepend spoofed entries to; the last entry is the one the
// edge itself added. Mirrors app/api/admin/login/route.ts's clientIp.
function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return "unknown";
}

// Public, unauthenticated endpoint — generous per-IP throttle as cheap
// insurance against a runaway caller, not an access gate.
async function rateLimitedHandler(req: Request): Promise<Response> {
  const rl = await checkRateLimit(`mcp:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "retry-after": String(rl.retryAfter) },
    });
  }
  return mcpHandler(req);
}

export { rateLimitedHandler as GET, rateLimitedHandler as POST };

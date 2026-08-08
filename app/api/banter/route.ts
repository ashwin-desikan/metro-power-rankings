/**
 * /api/banter — the Banter Engine beta gateway.
 *
 * Server-side security boundary (see Banter Engine Security Threat Model §11):
 *  - BANTER_BETA_KEY: required passphrase, checked server-side (hash compare).
 *  - The client sends only {key, scenario, messages, temperature}; the system
 *    prompt and fact card are assembled HERE (banterCore), and any client
 *    message with a role other than user/assistant is discarded.
 *  - Per-instance token-bucket rate limit + a daily request breaker. Honest
 *    caveat: serverless instances each carry their own bucket, so these are
 *    soft limits — fine for a ~20-person beta, backstopped by max_tokens and
 *    the provider's own spend limit (set one there too).
 *  - Output linted (future years / banned terms) with one corrective retry.
 *  - Logs are content-free by default: hashed caller id, sizes, latency.
 *
 * Env:
 *  BANTER_BETA_KEY        required — the beta passphrase
 *  BANTER_API_KEY         required — hosted inference key (OpenRouter-compatible)
 *  BANTER_API_URL         default https://openrouter.ai/api/v1/chat/completions
 *  BANTER_MODEL           default meta-llama/llama-3.1-8b-instruct
 *  BANTER_DAILY_REQUESTS  default 2000 (global-ish daily breaker)
 *  BANTER_LOG_SALT        optional — stabilises the hashed caller id
 */
import { createHash } from "crypto";
import scenariosJson from "@/lib/banter/scenarios.json";
import factsJson from "@/lib/banter/facts.json";
import {
  Atom, LIMITS, Msg, Scenario, factCard, lint, resolveScenario, sanitizeMessages, systemPrompt,
} from "@/lib/banter/banterCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCENARIOS = scenariosJson as unknown as Scenario[];
const ATOMS = factsJson as unknown as Atom[];

// ---------------------------------------------------------------- rate limiting
const BUCKETS = new Map<string, { tokens: number; last: number }>();
const RATE_CAPACITY = 8;
const RATE_REFILL_MS = 5000;
let dayKey = "";
let dayCount = 0;

function allow(id: string): boolean {
  const now = Date.now();
  const b = BUCKETS.get(id) ?? { tokens: RATE_CAPACITY, last: now };
  b.tokens = Math.min(RATE_CAPACITY, b.tokens + (now - b.last) / RATE_REFILL_MS);
  b.last = now;
  if (b.tokens < 1) { BUCKETS.set(id, b); return false; }
  b.tokens -= 1; BUCKETS.set(id, b);
  return true;
}

function underDailyBreaker(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; }
  dayCount += 1;
  return dayCount <= parseInt(process.env.BANTER_DAILY_REQUESTS ?? "2000", 10);
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function callerId(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return sha((process.env.BANTER_LOG_SALT ?? "banter") + ip).slice(0, 12);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------- inference
async function complete(messages: Msg[], temperature: number): Promise<string> {
  const url = process.env.BANTER_API_URL ?? "https://openrouter.ai/api/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.BANTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.BANTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct",
      messages,
      temperature: Math.max(0, Math.min(1.2, temperature)),
      max_tokens: LIMITS.MAX_TOKENS,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`inference ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------- handlers
export async function GET(): Promise<Response> {
  // scenario list for the beta page (no auth needed: labels only, no facts)
  const now = new Date();
  const list = [
    { id: "today", label: "🌍 Your local · today" },
    ...SCENARIOS.map((s) => ({ id: s.id, label: s.label })),
  ];
  const detail = [resolveScenario("today", SCENARIOS, now)!, ...SCENARIOS].map((s) => ({
    id: s.id, label: s.label, dateLong: s.dateLong, place: s.place,
    setting: s.setting, chips: s.chips ?? [], open: s.open,
  }));
  return json(200, { ok: true, scenarios: list, detail });
}

export async function POST(req: Request): Promise<Response> {
  const who = callerId(req);
  if (!allow(who)) return json(429, { error: "Easy on — one at a time." });
  if (!underDailyBreaker()) return json(503, { error: "The bar's closed for today — back tomorrow." });

  let body: {
    key?: string; scenario?: string; messages?: unknown; temperature?: number;
  };
  try {
    const text = await req.text();
    if (text.length > 16_384) return json(413, { error: "too large" });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "bad json" });
  }

  const beta = process.env.BANTER_BETA_KEY;
  if (!beta || !process.env.BANTER_API_KEY) {
    return json(503, { error: "beta not configured" });
  }
  // BANTER_BETA_KEY is a comma-separated list: one key per tester. The logs
  // record which key was used (kidx), so one person can be revoked by removing
  // their key from the list without disturbing anyone else.
  const keys = beta.split(",").map((k) => k.trim()).filter(Boolean);
  const supplied = sha(String(body.key ?? ""));
  const kidx = keys.findIndex((k) => sha(k) === supplied);
  if (kidx < 0) {
    console.log(JSON.stringify({ at: "banter", kind: "auth-fail", who }));
    return json(401, { error: "That's not the passphrase. Ask Ashwin." });
  }

  const s = resolveScenario(String(body.scenario ?? ""), SCENARIOS, new Date());
  if (!s) return json(400, { error: "unknown scenario" });

  const messages = sanitizeMessages(body.messages);
  if (!messages.length) return json(400, { error: "messages required" });
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const sys: Msg = { role: "system", content: systemPrompt(s, factCard(s, ATOMS, lastUser)) };
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.8;

  const t0 = Date.now();
  try {
    let reply = await complete([sys, ...messages], temperature);
    let slips = lint(reply, s);
    let retried = false;
    if (slips.length) {
      const fix: Msg = {
        role: "system",
        content: `Your last reply mentioned ${slips.join(", ")} — that breaks the scenario dated ` +
          `${s.dateLong}. Rewrite the reply staying strictly inside ${s.dateLong}, same warmth and opinion.`,
      };
      reply = await complete([sys, ...messages, { role: "assistant", content: reply }, fix], temperature);
      slips = lint(reply, s);
      retried = true;
    }
    console.log(JSON.stringify({
      at: "banter", kind: "chat", who, kidx, scenario: s.id,
      in: lastUser.length, out: reply.length, ms: Date.now() - t0, slips, retried,
    }));
    return json(200, { reply, slips });
  } catch (e) {
    console.log(JSON.stringify({ at: "banter", kind: "error", who, err: String(e).slice(0, 200) }));
    return json(502, { error: "The local's lost his voice — try again in a minute." });
  }
}

"use client";

// Activation modal (reverse ETL, mocked). Pushes a built segment to a chosen
// destination with field mapping, a payload preview, and a sync log. The
// governance gate is enforced here: only opted-in, non-suppressed rows sync;
// the clean room exports aggregate cohort counts only, with a k-anonymity
// threshold. Every destination and sync is SIMULATED and labeled as such.

import { useMemo, useState } from "react";

type Consent = "opted_in" | "opted_out" | "unknown";
export type ActProfile = {
  slug: string;
  name: string;
  country: string;
  region: string;
  continent: string;
  attrs: { rank: number | null };
  governance: { consent: Consent; suppressed: boolean };
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ACCENT = "#4ECDC4";
const GOLD = "#d4af37";
const K_ANON = 25;

type Dest = {
  id: string;
  name: string;
  blurb: string;
  kind: "ad" | "crm" | "cleanroom" | "file";
  fields: string[];
};

const DESTINATIONS: Dest[] = [
  { id: "meta", name: "Meta Ads", blurb: "Custom Audiences via hashed identifiers", kind: "ad", fields: ["external_id", "country", "city", "audience_name"] },
  { id: "google", name: "Google Ads", blurb: "Customer Match list", kind: "ad", fields: ["user_id", "country", "postal_code"] },
  { id: "braze", name: "Braze (CRM / email)", blurb: "User attributes plus an audience tag", kind: "crm", fields: ["external_id", "country", "region", "segment_tag"] },
  { id: "cleanroom", name: "Clean room", blurb: `Aggregate-only match, k-anonymity ≥ ${K_ANON}`, kind: "cleanroom", fields: ["cohort_key", "count"] },
  { id: "csv", name: "CSV export", blurb: "Download the addressable rows", kind: "file", fields: ["metro", "country", "region", "rank"] },
];

const SOURCE_FIELDS: { key: string; label: string }[] = [
  { key: "slug", label: "Metro ID (slug)" },
  { key: "name", label: "Metro name" },
  { key: "country", label: "Country" },
  { key: "region", label: "Region" },
  { key: "continent", label: "Continent" },
  { key: "rank", label: "Overall rank" },
  { key: "consent", label: "Consent state" },
  { key: "__const_segment", label: "Segment name (constant)" },
  { key: "__none", label: "(leave empty)" },
];

function defaultMap(field: string): string {
  const f = field.toLowerCase();
  if (f.includes("external") || f.includes("user") || f === "cohort_key") return "slug";
  if (f.includes("metro") || f === "city") return "name";
  if (f.includes("country")) return "country";
  if (f.includes("region")) return "region";
  if (f.includes("postal")) return "country";
  if (f.includes("rank")) return "rank";
  if (f.includes("segment") || f.includes("audience")) return "__const_segment";
  if (f === "count") return "__none";
  return "name";
}

function srcVal(p: ActProfile, key: string, segName: string): string | number | null {
  switch (key) {
    case "slug": return p.slug;
    case "name": return p.name;
    case "country": return p.country;
    case "region": return p.region;
    case "continent": return p.continent;
    case "rank": return p.attrs.rank;
    case "consent": return p.governance.consent;
    case "__const_segment": return segName || "segment";
    default: return null;
  }
}

export default function ActivationModal({
  audience,
  segmentName,
  onClose,
}: {
  audience: ActProfile[];
  segmentName: string;
  onClose: () => void;
}) {
  const [destId, setDestId] = useState<string>("meta");
  const dest = DESTINATIONS.find((d) => d.id === destId)!;
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  // Governance gate, enforced here, not in the preview only.
  const gate = useMemo(() => {
    const addressable: ActProfile[] = [];
    let optedOut = 0, unknown = 0, suppressed = 0;
    for (const p of audience) {
      if (p.governance.suppressed) suppressed++;
      else if (p.governance.consent === "opted_in") addressable.push(p);
      else if (p.governance.consent === "opted_out") optedOut++;
      else unknown++;
    }
    return { addressable, optedOut, unknown, suppressed, withheld: optedOut + unknown + suppressed };
  }, [audience]);

  // Field mapping for the chosen destination (defaults applied per field).
  const map = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of dest.fields) m[f] = mapping[`${dest.id}.${f}`] ?? defaultMap(f);
    return m;
  }, [dest, mapping]);
  const setField = (f: string, v: string) => setMapping((mm) => ({ ...mm, [`${dest.id}.${f}`]: v }));

  // Clean-room aggregate: continent cohorts, with small cohorts suppressed.
  const cohorts = useMemo(() => {
    if (dest.kind !== "cleanroom") return [];
    const by = new Map<string, number>();
    for (const p of gate.addressable) by.set(p.continent, (by.get(p.continent) ?? 0) + 1);
    return Array.from(by.entries())
      .map(([cohort, count]) => ({ cohort, count, ok: count >= K_ANON }))
      .sort((a, b) => b.count - a.count);
  }, [dest, gate.addressable]);

  const preview = useMemo(() => {
    if (dest.kind === "cleanroom") {
      return JSON.stringify(
        cohorts.filter((c) => c.ok).map((c) => ({ cohort_key: c.cohort, count: c.count })),
        null,
        2,
      );
    }
    const rows = gate.addressable.slice(0, 3).map((p) => {
      const o: Record<string, string | number | null> = {};
      for (const f of dest.fields) o[f] = srcVal(p, map[f], segmentName);
      return o;
    });
    if (dest.kind === "file") {
      const head = dest.fields.join(",");
      const body = rows.map((r) => dest.fields.map((f) => r[f] ?? "").join(",")).join("\n");
      return `${head}\n${body}`;
    }
    return JSON.stringify(rows, null, 2);
  }, [dest, gate.addressable, map, cohorts, segmentName]);

  const syncedCount =
    dest.kind === "cleanroom"
      ? cohorts.filter((c) => c.ok).reduce((s, c) => s + c.count, 0)
      : gate.addressable.length;
  const cohortSuppressed = cohorts.filter((c) => !c.ok).reduce((s, c) => s + c.count, 0);

  function runSync() {
    const lines: string[] = [];
    const t = () => new Date().toLocaleTimeString();
    lines.push(`${t()}  Connecting to ${dest.name} (simulated)…`);
    lines.push(`${t()}  Applying field mapping (${dest.fields.length} fields)`);
    lines.push(`${t()}  Governance gate: ${gate.withheld.toLocaleString()} withheld (${gate.suppressed} suppressed, ${gate.optedOut} opted out, ${gate.unknown} unknown consent)`);
    if (dest.kind === "cleanroom") {
      lines.push(`${t()}  k-anonymity ≥ ${K_ANON}: ${cohortSuppressed.toLocaleString()} in small cohorts withheld`);
      lines.push(`${t()}  Exported ${cohorts.filter((c) => c.ok).length} aggregate cohorts (${syncedCount.toLocaleString()} records, counts only, no PII)`);
    } else {
      lines.push(`${t()}  Synced ${syncedCount.toLocaleString()} records to ${dest.name}`);
    }
    lines.push(`${t()}  Done. ✔`);
    setLog(lines);
    setDone(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl rounded-2xl border my-auto"
        style={card}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-lg font-semibold">Activate audience</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Reverse ETL to a destination. Simulated, no live integration. Governance is enforced here.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-dim)] hover:text-[var(--accent)] text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Destination picker */}
          <div>
            <div className="text-xs font-semibold text-[var(--text-muted)] mb-2">Destination</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {DESTINATIONS.map((d) => {
                const on = d.id === destId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { setDestId(d.id); setDone(false); setLog([]); }}
                    className="rounded-lg border px-2.5 py-2 text-left transition"
                    style={{ backgroundColor: on ? ACCENT : "transparent", color: on ? "var(--bg)" : "var(--text)", borderColor: on ? ACCENT : "var(--border)" }}
                  >
                    <div className="text-xs font-semibold leading-tight">{d.name}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--text-dim)] mt-1.5">{dest.blurb}</p>
          </div>

          {/* Governance summary */}
          <div className="rounded-lg border p-3 text-xs" style={card}>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <span><span className="tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{syncedCount.toLocaleString()}</span> <span className="text-[var(--text-muted)]">will sync</span></span>
              <span><span className="tabular-nums font-semibold" style={mono}>{gate.withheld.toLocaleString()}</span> <span className="text-[var(--text-muted)]">withheld by governance</span></span>
              {dest.kind === "cleanroom" && cohortSuppressed > 0 && (
                <span className="text-[var(--text-dim)]">{cohortSuppressed.toLocaleString()} more below k-anonymity</span>
              )}
            </div>
          </div>

          {/* Field mapping (not for clean room) */}
          {dest.kind !== "cleanroom" && (
            <div>
              <div className="text-xs font-semibold text-[var(--text-muted)] mb-2">Field mapping</div>
              <div className="space-y-1.5">
                {dest.fields.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs">
                    <code className="w-40 shrink-0 text-[var(--text-muted)]" style={mono}>{f}</code>
                    <span className="text-[var(--text-dim)]">←</span>
                    <select
                      value={map[f]}
                      onChange={(e) => setField(f, e.target.value)}
                      className="rounded border px-2 py-1 bg-transparent flex-1"
                      style={card}
                    >
                      {SOURCE_FIELDS.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payload preview */}
          <div>
            <div className="text-xs font-semibold text-[var(--text-muted)] mb-2">
              {dest.kind === "cleanroom" ? "Aggregate export preview" : dest.kind === "file" ? "CSV preview (first rows)" : "Payload preview (first rows)"}
            </div>
            <pre className="rounded-lg border p-3 text-[11px] overflow-x-auto leading-relaxed" style={{ ...card, ...mono }}>
              {preview || "No addressable rows to preview."}
            </pre>
          </div>

          {/* Sync log */}
          {log.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[var(--text-muted)] mb-2">Sync log</div>
              <div className="rounded-lg border p-3 text-[11px] space-y-0.5" style={{ ...card, ...mono }}>
                {log.map((l, i) => (
                  <div key={i} className={i === log.length - 1 ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}>{l}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs text-[var(--text-dim)]">Simulated activation · {segmentName || "Untitled segment"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-xs hover:border-[var(--accent)]" style={card}>Close</button>
            <button
              type="button"
              onClick={runSync}
              disabled={syncedCount === 0}
              className="rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: GOLD, color: "#1a1a1a" }}
            >
              {done ? "Re-run sync" : dest.kind === "file" ? "Generate export" : "Run sync"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { flagCdnUrl } from "@/lib/international-display";
import type { RugbyFixtures as RF, RugbyMatch } from "@/lib/rugbyFixtures";

function slugify(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const SLUG_OVERRIDE: Record<string, string> = { "Ivory Coast": "ivory-coast", "Western Samoa": "samoa" };
const slugFor = (n: string) => SLUG_OVERRIDE[n] ?? slugify(n);
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function Team({ name, score, win }: { name: string; score: number | null; win: boolean }) {
  const flag = flagCdnUrl(slugFor(name));
  return (
    <span className="inline-flex items-center gap-1.5">
      {flag ? <img src={flag} alt="" aria-hidden width={18} height={13} className="inline-block flex-shrink-0" /> : null}
      <span className={win ? "font-semibold" : ""}>{name}</span>
      {score !== null ? <span className="tabular-nums" style={mono}>{score}</span> : null}
    </span>
  );
}

function Row({ m }: { m: RugbyMatch }) {
  const aWin = m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
  const bWin = m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;
  const day = new Date(m.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2.5 text-sm flex-wrap">
        <Team name={m.teamA} score={m.scoreA} win={aWin} />
        <span className="text-[var(--text-dim)]">v</span>
        <Team name={m.teamB} score={m.scoreB} win={bWin} />
      </div>
      <div className="text-right text-xs flex-shrink-0">
        <div className="text-[var(--text-muted)]">{m.status === "live" ? <span style={{ color: "#10b981" }}>● LIVE</span> : day}</div>
        <div className="text-[var(--text-dim)] truncate max-w-[15rem]">{m.competition}{m.city ? ` · ${m.city}` : ""}</div>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: RugbyMatch[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)", ...mono }}>{title}</div>
      {items.map((m, i) => <Row key={`${m.date}-${m.teamA}-${i}`} m={m} />)}
    </div>
  );
}

export default function RugbyFixtures({ data }: { data: RF }) {
  return (
    <section className="rounded-xl border p-4 mb-8" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold">International Fixtures &amp; Results</h2>
        <span className="text-[10px] text-[var(--text-dim)]" style={mono}>World Rugby</span>
      </div>
      <Section title="Live" items={data.live} />
      <Section title="Upcoming" items={data.upcoming} />
      <Section title="Recent results" items={data.recent} />
    </section>
  );
}

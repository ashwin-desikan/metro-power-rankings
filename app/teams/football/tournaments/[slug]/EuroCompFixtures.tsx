import type { EuroComp, EuroMatch } from "@/lib/euroComps";

function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day} · ${time} UTC`;
}

function MatchRow({ m }: { m: EuroMatch }) {
  const played = m.status !== "upcoming" && m.homeGoals != null && m.awayGoals != null;
  return (
    <div
      className="flex items-center gap-2 py-1.5 px-3 border-b last:border-b-0 text-sm"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex-1 text-right truncate">{m.home}</div>
      <div className="tabular-nums font-semibold text-center min-w-[64px]">
        {played ? (
          <span>
            {m.homeGoals} <span className="text-[var(--text-dim)]">–</span> {m.awayGoals}
          </span>
        ) : (
          <span className="text-[11px] font-normal text-[var(--text-muted)] whitespace-nowrap">{fmtKickoff(m.date)}</span>
        )}
      </div>
      <div className="flex-1 truncate">{m.away}</div>
      {m.round ? (
        <div className="hidden sm:block w-32 text-right text-[10px] text-[var(--text-muted)] truncate">{m.round}</div>
      ) : null}
    </div>
  );
}

function Section({ title, dot, items }: { title: string; dot?: string; items: EuroMatch[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        {dot ? (
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: dot }} aria-hidden />
        ) : null}
        <h3 className="text-xs uppercase tracking-wide font-semibold text-[var(--text-muted)]">{title}</h3>
      </div>
      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {items.map((m, i) => (
          <MatchRow key={`${m.date}-${m.home}-${m.away}-${i}`} m={m} />
        ))}
      </div>
    </div>
  );
}

export default function EuroCompFixtures({ data }: { data: EuroComp }) {
  return (
    <section id="fixtures" className="mb-8 scroll-mt-20">
      <h2 className="text-xl font-bold mb-3">Fixtures &amp; Results</h2>
      <Section title="Live" dot="#22c55e" items={data.live} />
      <Section title="Upcoming" items={data.upcoming} />
      <Section title="Recent Results" items={data.recent} />
    </section>
  );
}

import Link from "next/link";
import { getFootballClubByName } from "@/lib/football";
import type { LiveComp, LiveGroup } from "@/lib/clubFootballLive";
import { deriveCompBracket, type DerivedEntry } from "@/lib/euroCompDerive";

// Round-by-round "alive vs eliminated" view for a continental competition,
// derived ENTIRELY from the api-football fixtures bundle (lib/euroCompDerive)
// — the same visual language as the workbook-fed CurrentSeasonBracket on this
// page (and the Libertadores / NBA / NHL playoff surfaces), but needing no
// workbook row. The hub renders this only when the curated workbook entries
// don't cover the season yet; the workbook wins once it does. Knockout rounds
// appear here automatically as api-football names the ties (Feb onward), and
// the champion chip lights up from the final's result.

export default function LiveCompBracket({
  comp,
  rankedGroups,
  season,
  label,
}: {
  comp: LiveComp;
  rankedGroups: LiveGroup[];
  season: string | null;
  label: string;
}) {
  const bracket = deriveCompBracket(comp, rankedGroups);
  if (!bracket) return null;
  const { stages, aliveCount, totalCount, champion } = bracket;

  return (
    <section className="mb-8">
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{season ?? ""} {label}</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {champion ? (
              <>Champion crowned. {totalCount} clubs entered.</>
            ) : (
              <>{aliveCount} club{aliveCount === 1 ? "" : "s"} still alive of {totalCount} entered. Round-by-round view; no match scores in this surface.</>
            )}
          </p>
        </div>
      </header>
      <div className="rounded-xl border p-4 space-y-2" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        {stages.map((s) => (
          <div key={s.index} className="border-l-2 pl-3 py-2" style={{ borderColor: "var(--border)" }}>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-1.5 flex items-baseline gap-2">
              <span>{s.label}</span>
              <span className="text-[var(--text-dim)] tabular-nums">
                {s.alive.length > 0 && `${s.alive.length} ${s.label === "Final" && champion ? "champion" : "alive"}`}
                {s.alive.length > 0 && s.eliminated.length > 0 && ", "}
                {s.eliminated.length > 0 && `${s.eliminated.length} out`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.alive.map((e) => (
                <Chip key={e.key} entry={e} tone={e.champion ? "champion" : "alive"} />
              ))}
              {s.eliminated.map((e) => (
                <Chip key={e.key} entry={e} tone="eliminated" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Chip({ entry, tone }: { entry: DerivedEntry; tone: "alive" | "eliminated" | "champion" }) {
  const club = getFootballClubByName(entry.lookup ?? "") ?? getFootballClubByName(entry.name ?? "");
  const name = club?.cur_name ?? entry.lookup ?? entry.name ?? "TBD";
  const slug = club?.slug ?? null;
  const baseClass =
    "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full whitespace-nowrap transition-opacity";

  let node: React.ReactNode;
  if (tone === "champion") {
    node = (
      <span className={`${baseClass} font-semibold`} style={{ background: "rgba(212,175,55,0.22)", color: "#d4af37" }} title="Champion">
        <span aria-hidden>★</span>
        <span>{name}</span>
      </span>
    );
  } else if (tone === "alive") {
    node = (
      <span className={`${baseClass} font-semibold`} style={{ background: "rgba(16,185,129,0.18)", color: "#10b981" }} title="Still alive">
        <span>{name}</span>
      </span>
    );
  } else {
    node = (
      <span className={`${baseClass} border opacity-65 hover:opacity-100`} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} title="Eliminated at this round">
        <span>{name}</span>
      </span>
    );
  }
  return slug ? <Link href={`/teams/football/${slug}`} className="hover:opacity-85">{node}</Link> : node;
}

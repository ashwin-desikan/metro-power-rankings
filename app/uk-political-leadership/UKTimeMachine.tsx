"use client";
import { useMemo, useState } from "react";

type Dated = { name: string; party: string | null; start: string; end: string | null; note?: string };
type Chamber = {
  name: string;
  start: string;
  end: string;
  total: number;
  parties: { party: string; seats: number }[];
  note?: string;
};
type Offices = {
  chancellor: Dated[];
  foreignSecretary: Dated[];
  homeSecretary: Dated[];
  deputyPrimeMinister: Dated[];
  leaderOfOpposition: Dated[];
  firstMinisterScotland: Dated[];
  firstMinisterWales: Dated[];
  firstMinisterNorthernIreland: Dated[];
};

const PARTY_ALIAS: Record<string, string> = {
  "conservative and unionist": "Conservative",
  tory: "Tory",
  "liberal democrats": "Liberal Democrat",
  "labour and co-operative": "Labour",
  "labour co-operative": "Labour",
  "labour/co-operative": "Labour",
  "scottish national party": "SNP",
  "democratic unionist party": "DUP",
  "sinn féin": "Sinn Féin",
  "sinn fein": "Sinn Féin",
  "your party": "Your Party",
  independent: "Independent",
};
function normParty(p?: string | null): string {
  if (!p) return "—";
  const raw = p.trim();
  if (PARTY_ALIAS[raw.toLowerCase()]) return PARTY_ALIAS[raw.toLowerCase()];
  const s = raw.replace(/\s+Party$/i, "").trim();
  return PARTY_ALIAS[s.toLowerCase()] ?? s;
}

const PARTY_COLOR: Record<string, string> = {
  Conservative: "#0087DC",
  Labour: "#E4003B",
  "Liberal Democrat": "#FAA61A",
  Liberal: "#FAA61A",
  Whig: "#F58220",
  Tory: "#0087DC",
  Peelite: "#7c3aed",
  "Irish Nationalist": "#169b62",
  "SNP / Plaid Cymru": "#FDF38E",
  "Northern Ireland": "#5ea9a0",
  "UK Unionist": "#4b0082",
  "Ulster Popular Unionist": "#7b68ee",
  "Vanguard Unionist": "#1e3a8a",
  "Traditional Unionist Voice": "#0d3b66",
  "Liberal Unionist": "#6b7280",
  Unionist: "#0d3b66",
  National: "#6b7280",
  "National Liberal": "#c8a24a",
  Coalition: "#6b7280",
  SNP: "#FDF38E",
  "Plaid Cymru": "#005B54",
  DUP: "#D46A4C",
  "Sinn Féin": "#326760",
  "Ulster Unionist": "#9999FF",
  SDLP: "#2AA82C",
  "Alliance": "#F6CB2F",
  Green: "#6AB023",
  "Reform UK": "#14B8A6",
  "Your Party": "#9333EA",
  "Restore Britain": "#B8860B",
  Vacant: "#d1d5db",
  Independent: "#6b7280",
  Crossbench: "#8a8f98",
  "Non-affiliated": "#9ca3af",
  Speaker: "#4b5563",
  Other: "#9ca3af",
};
const colorOf = (p?: string | null) => PARTY_COLOR[normParty(p)] ?? "#9ca3af";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });

function onDate(list: Dated[], d: string): Dated | null {
  return list.find((o) => o.start <= d && (o.end == null || d < o.end)) ?? null;
}

function Card({ label, office, showParty = true }: { label: string; office: Dated | null; showParty?: boolean }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      {office ? (
        <>
          <p className="text-lg font-bold text-[var(--text)]">{office.name}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {showParty && office.party ? (
              <span style={{ color: colorOf(office.party) }}>{normParty(office.party)}</span>
            ) : null}
            {showParty && office.party ? " · " : ""}
            {office.start.slice(0, 4)}–{office.end ? office.end.slice(0, 4) : "present"}
            {office.note ? <span className="text-[var(--text-dim)]"> · {office.note}</span> : null}
          </p>
        </>
      ) : (
        <p className="text-lg font-bold text-[var(--text-dim)] italic">Vacant</p>
      )}
    </div>
  );
}

function BalanceBar({ parties, total }: { parties: { party: string; seats: number }[]; total: number }) {
  return (
    <>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
        {parties.map((p) => (
          <div key={p.party} style={{ width: `${(p.seats / total) * 100}%`, backgroundColor: colorOf(p.party) }} title={`${p.party}: ${p.seats}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mt-2 text-sm">
        {parties.map((p) => (
          <span key={p.party} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorOf(p.party) }} />
            <span className="font-semibold text-[var(--text)] tabular-nums">{p.seats}</span>
            <span className="text-[var(--text-muted)]">{normParty(p.party)}</span>
          </span>
        ))}
      </div>
    </>
  );
}

function ChamberPanel({ label, chamber }: { label: string; chamber: Chamber | null }) {
  if (!chamber) return null;
  return (
    <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label} · {chamber.name}</p>
        <p className="text-xs text-[var(--text-muted)] tabular-nums">{chamber.total} seats</p>
      </div>
      <BalanceBar parties={chamber.parties} total={chamber.total} />
      {chamber.note ? (
        <p className="text-xs text-[var(--text-dim)] mt-2">Seat change: {chamber.note}</p>
      ) : null}
    </div>
  );
}

const DEVOLVED: { key: keyof Offices; label: string }[] = [
  { key: "firstMinisterScotland", label: "Scotland" },
  { key: "firstMinisterWales", label: "Wales" },
  { key: "firstMinisterNorthernIreland", label: "Northern Ireland" },
];

export default function UKTimeMachine({
  sovereigns, primeMinisters, offices, commons = [], lords = [],
}: {
  sovereigns: Dated[];
  primeMinisters: Dated[];
  offices: Offices;
  commons?: Chamber[];
  lords?: Chamber[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const sovereign = onDate(sovereigns, date);
  const pm = onDate(primeMinisters, date);
  const chancellor = onDate(offices.chancellor, date);
  const foreign = onDate(offices.foreignSecretary, date);
  const home = onDate(offices.homeSecretary, date);
  const deputy = onDate(offices.deputyPrimeMinister, date);
  const opposition = onDate(offices.leaderOfOpposition, date);
  const commonsNow = commons.find((c) => c.start <= date && date < c.end) ?? null;
  const lordsNow = useMemo(() => {
    const inRange = lords.filter((c) => c.start <= date && (!c.end || date < c.end));
    return inRange.length ? inRange[inRange.length - 1] : null;
  }, [lords, date]);
  const devolved = useMemo(
    () => DEVOLVED.map((d) => ({ label: d.label, holder: onDate(offices[d.key], date) })),
    [offices, date],
  );
  const anyDevolved = devolved.some((d) => d.holder);
  const anyGreatOffice = chancellor || foreign || home || deputy || opposition;

  return (
    <section className="mb-12">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="date"
          value={date}
          min="1707-05-01"
          max={today}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
          className="rounded-lg border px-3 py-2 text-sm text-[var(--text)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        />
        <span className="text-sm text-[var(--text-muted)]">{fmtDate(date)}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <Card label="The Sovereign" office={sovereign} showParty={false} />
        <Card label="Prime Minister" office={pm} />
      </div>

      {anyGreatOffice ? (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">
            Great Offices of State &amp; leadership
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deputy ? <Card label="Deputy Prime Minister" office={deputy} /> : null}
            <Card label="Chancellor of the Exchequer" office={chancellor} />
            <Card label="Foreign Secretary" office={foreign} />
            <Card label="Home Secretary" office={home} />
            {opposition ? <Card label="Leader of the Opposition" office={opposition} /> : null}
          </div>
        </div>
      ) : null}

      <ChamberPanel label="House of Commons" chamber={commonsNow} />
      <ChamberPanel label="House of Lords" chamber={lordsNow} />

      {anyDevolved ? (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">Devolved First Ministers</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
            {devolved.map((d) => (
              <div key={d.label} className="flex items-baseline gap-1.5">
                {d.holder ? (
                  <span className="inline-block w-2 h-2 rounded-full shrink-0 translate-y-[-1px]" style={{ backgroundColor: colorOf(d.holder.party) }} />
                ) : null}
                <span className="text-xs font-semibold text-[var(--text)] shrink-0">{d.label}:</span>
                <span className="text-xs text-[var(--text-muted)]">{d.holder ? d.holder.name : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-[var(--text-dim)] mt-3">
        The Sovereign and Prime Minister are shown for any date back to the early 18th century.
        Great Offices of State, chamber composition, and devolved First Ministers appear where data is available.
      </p>
    </section>
  );
}

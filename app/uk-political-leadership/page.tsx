import type { Metadata } from "next";
import Link from "next/link";
import {
  getUkPmAndSovereign,
  getUkOffices,
  getUkCommonsHistory,
  getUkLordsHistory,
  type UkDated,
  type UkChamber,
} from "@/lib/ukPolitics";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PATH = "/uk-political-leadership";
const TITLE = "United Kingdom Political Leadership";
const DESC =
  "Who holds power in the United Kingdom: the Sovereign, the Prime Minister and the Great Offices of State, the composition of the Houses of Commons and Lords, the Leader of the Opposition, and the devolved First Ministers — with a time machine back to the early 18th century.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

const PARTY_COLOR: Record<string, string> = {
  Conservative: "#0087DC", Labour: "#E4003B", "Liberal Democrat": "#FAA61A", Liberal: "#FAA61A",
  Whig: "#F58220", Tory: "#0087DC", Peelite: "#7c3aed", SNP: "#FDF38E", "Plaid Cymru": "#005B54",
  "Irish Nationalist": "#169b62", "SNP / Plaid Cymru": "#FDF38E", "Northern Ireland": "#5ea9a0",
  "UK Unionist": "#4b0082", "Ulster Popular Unionist": "#7b68ee", "Vanguard Unionist": "#1e3a8a", "Traditional Unionist Voice": "#0d3b66",
  DUP: "#D46A4C", "Sinn Féin": "#326760", "Ulster Unionist": "#9999FF", SDLP: "#2AA82C",
  Alliance: "#F6CB2F", Green: "#6AB023", "Reform UK": "#12B6CF", Independent: "#6b7280",
  Crossbench: "#8a8f98", "Non-affiliated": "#9ca3af", Speaker: "#4b5563",
};
const cleanParty = (p?: string | null) => (p ? p.replace(/\s+Party$/i, "").trim() : "");
const colorOf = (p?: string | null) => PARTY_COLOR[cleanParty(p)] ?? "#9ca3af";
const today = () => new Date().toISOString().slice(0, 10);
const onDate = (list: UkDated[], d: string): UkDated | null =>
  list.find((o) => o.start <= d && (o.end == null || d < o.end)) ?? null;

function Card({ label, office, showParty = true }: { label: string; office: UkDated | null; showParty?: boolean }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      {office ? (
        <>
          <p className="text-lg font-bold text-[var(--text)]">{office.name}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {showParty && office.party ? <span style={{ color: colorOf(office.party) }}>{cleanParty(office.party)}</span> : null}
            {showParty && office.party ? " · " : ""}since {office.start.slice(0, 4)}
            {office.note ? <span className="text-[var(--text-dim)]"> · {office.note}</span> : null}
          </p>
        </>
      ) : (
        <p className="text-lg font-bold text-[var(--text-dim)] italic">Vacant</p>
      )}
    </div>
  );
}

function ChamberBar({ label, chamber }: { label: string; chamber: UkChamber | null }) {
  if (!chamber) return null;
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <h2 className="text-xl font-bold text-[var(--text)]">{label}</h2>
        <p className="text-xs text-[var(--text-muted)] tabular-nums">{chamber.name} · {chamber.total} seats</p>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
        {chamber.parties.map((p) => (
          <div key={p.party} style={{ width: `${(p.seats / chamber.total) * 100}%`, backgroundColor: colorOf(p.party) }} title={`${p.party}: ${p.seats}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mt-2 text-sm">
        {chamber.parties.map((p) => (
          <span key={p.party} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorOf(p.party) }} />
            <span className="font-semibold text-[var(--text)] tabular-nums">{p.seats}</span>
            <span className="text-[var(--text-muted)]">{cleanParty(p.party)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function UKPoliticalLeadershipPage() {
  const d = today();
  const { sovereigns, primeMinisters } = getUkPmAndSovereign();
  const offices = await getUkOffices();
  const commons = await getUkCommonsHistory();
  const lords = await getUkLordsHistory();

  const cur = (list: UkDated[]) => onDate(list, d);
  const commonsNow = commons.find((c) => c.start <= d && d < c.end) ?? commons[commons.length - 1] ?? null;
  const lordsNow = lords.filter((c) => c.start <= d && (!c.end || d < c.end)).slice(-1)[0] ?? null;
  const devolved: { label: string; holder: UkDated | null }[] = [
    { label: "Scotland", holder: cur(offices.firstMinisterScotland) },
    { label: "Wales", holder: cur(offices.firstMinisterWales) },
    { label: "Northern Ireland", holder: cur(offices.firstMinisterNorthernIreland) },
  ];
  const anyGreat = cur(offices.chancellor) || cur(offices.foreignSecretary) || cur(offices.homeSecretary) || cur(offices.deputyPrimeMinister) || cur(offices.leaderOfOpposition);
  const anyDevolved = devolved.some((x) => x.holder);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/countries/united-kingdom" className="hover:underline">United Kingdom</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <Link
          href="/elections/uk"
          className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Election history</p>
          <p className="text-lg font-bold text-[var(--text)]">UK general elections →</p>
          <p className="text-sm text-[var(--text-muted)]">Every general election: seats, vote share and the governments they made.</p>
        </Link>
        <Link
          href="/elections/forecast#uk"
          className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Forecast</p>
          <p className="text-lg font-bold text-[var(--text)]">UK forecast model →</p>
          <p className="text-sm text-[var(--text-muted)]">Weighted polling averages and simulated seat ranges for the next election.</p>
        </Link>
      </div>

      <Link
        href="/uk-political-leadership/time-machine"
        className="block mb-10 rounded-xl border p-4 transition-colors hover:border-[var(--accent)]"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
      >
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Time machine</p>
        <p className="text-lg font-bold text-[var(--text)]">A day in British political history →</p>
        <p className="text-sm text-[var(--text-muted)]">The Sovereign, Prime Minister, cabinet and Parliament on any date back to the early 18th century.</p>
      </Link>

      <section className="mb-10">
        <h2 className="text-xl font-bold mb-3 text-[var(--text)]">Crown &amp; Government</h2>
        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <Card label="The Sovereign" office={cur(sovereigns)} showParty={false} />
          <Card label="Prime Minister" office={cur(primeMinisters)} />
        </div>
        {anyGreat ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cur(offices.deputyPrimeMinister) ? <Card label="Deputy Prime Minister" office={cur(offices.deputyPrimeMinister)} /> : null}
            <Card label="Chancellor of the Exchequer" office={cur(offices.chancellor)} />
            <Card label="Foreign Secretary" office={cur(offices.foreignSecretary)} />
            <Card label="Home Secretary" office={cur(offices.homeSecretary)} />
            {cur(offices.leaderOfOpposition) ? <Card label="Leader of the Opposition" office={cur(offices.leaderOfOpposition)} /> : null}
          </div>
        ) : null}
      </section>

      <ChamberBar label="House of Commons" chamber={commonsNow} />
      <ChamberBar label="House of Lords" chamber={lordsNow} />

      {anyDevolved ? (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">Devolved First Ministers</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {devolved.map((x) => <Card key={x.label} label={x.label} office={x.holder} />)}
          </div>
        </section>
      ) : null}
    </main>
  );
}

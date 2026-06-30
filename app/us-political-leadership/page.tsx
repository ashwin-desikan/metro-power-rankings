import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import {
  getAllStateGovernors,
  getTerritoryGovernors,
  getStateMetroScore,
} from "@/lib/governors";
import { getUsCongress, type PartySplit } from "@/lib/usPolitics";
import { getState } from "@/lib/states";
import { getAllMetros } from "@/lib/data";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import GovernorsTable, { type GovRow } from "./GovernorsTable";
import SenatorsTable, { type SenRow } from "./SenatorsTable";

const PATH = "/us-political-leadership";
const TITLE = "United States Political Leadership";
const DESC =
  "Who holds power in the United States: the President, Vice President and Cabinet; every state governor; all 100 US senators; and House leadership — with party balance and, where it applies, the Metro Power score of the places they represent.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
};

const PARTY_COLOR: Record<string, string> = {
  Republican: "#b91c1c",
  Democratic: "#1d4ed8",
  Independent: "#6b7280",
  Vacant: "#cbd5e1",
};
function partyTextClass(p: string): string {
  const s = p.toLowerCase();
  if (s.includes("republican")) return "text-red-700 dark:text-red-400";
  if (s.includes("democratic")) return "text-blue-700 dark:text-blue-400";
  return "text-[var(--text-muted)]";
}
function scoreFor(metros: { score?: number | null }[]): number {
  return metros.reduce((s, m) => s + (m.score || 0), 0);
}

function PartySplitBar({ split }: { split: PartySplit }) {
  const entries = Object.entries(split).filter(
    ([k, v]) => k !== "note" && typeof v === "number",
  ) as [string, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className="mb-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ width: `${(v / total) * 100}%`, backgroundColor: PARTY_COLOR[k] || "#9ca3af" }} title={`${k}: ${v}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mt-2 text-sm">
        {entries.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PARTY_COLOR[k] || "#9ca3af" }} />
            <span className="font-semibold text-[var(--text)] tabular-nums">{v}</span>
            <span className="text-[var(--text-muted)]">{k}</span>
          </span>
        ))}
      </div>
      {typeof split.note === "string" ? (
        <p className="text-xs text-[var(--text-dim)] mt-1">{split.note}</p>
      ) : null}
    </div>
  );
}

function OfficialCard({ label, name, sub }: { label: string; name: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      <p className="text-lg font-bold text-[var(--text)]">{name}</p>
      {sub ? <p className="text-xs text-[var(--text-muted)]">{sub}</p> : null}
    </div>
  );
}

export default function USPoliticalLeadershipPage() {
  const congress = getUsCongress();

  // Governors
  const states = getAllStateGovernors();
  const terr = getTerritoryGovernors();
  const stateRows: GovRow[] = Object.entries(states)
    .map(([slug, g]) => {
      const ms = getStateMetroScore(slug);
      return { slug, name: getState(slug)?.name ?? slug, href: `/states/${slug}`, gov: g.name, party: g.party, since: g.since, score: ms?.score ?? 0, metros: ms?.metros ?? 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const allMetros = getAllMetros();
  const terrRows: GovRow[] = Object.entries(terr)
    .map(([slug, g]) => {
      const metros = allMetros.filter((m) => m.countrySlug === slug);
      return { slug, name: g.countryName, href: `/countries/${slug}`, gov: g.name, party: g.party, since: g.since, score: scoreFor(metros), metros: metros.length };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const rep = stateRows.filter((r) => r.party.toLowerCase().includes("republican")).length;
  const dem = stateRows.filter((r) => r.party.toLowerCase().includes("democratic")).length;

  // Senators (metro score = state weighted score / 2)
  const senRows: SenRow[] = (congress?.senate.members ?? [])
    .map((m) => ({ name: m.name, state: m.state, stateSlug: m.stateSlug, party: m.party, cls: m.class, score: (getStateMetroScore(m.stateSlug)?.score ?? 0) / 2 }))
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));

  const navItems = [
    { label: "Executive", href: "#executive" },
    { label: "Governors", href: "#governors" },
    { label: "Senate", href: "#senate" },
    { label: "House", href: "#house" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/countries/united-states" className="hover:underline">United States</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <HubNav items={navItems} />

      {congress ? (
        <section id="executive" className="mb-12 scroll-mt-20">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">Executive Branch</h2>
          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <OfficialCard label="President" name={congress.executive.president.name} sub={`${congress.executive.president.party ?? ""} · since ${congress.executive.president.since?.slice(0, 4) ?? ""}`} />
            <OfficialCard label="Vice President" name={congress.executive.vicePresident.name} sub={`${congress.executive.vicePresident.party ?? ""} · since ${congress.executive.vicePresident.since?.slice(0, 4) ?? ""}`} />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-muted)] mb-2">The Cabinet</h3>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
                  <th className="py-2 px-4">Office</th>
                  <th className="py-2 px-4">Official</th>
                  <th className="py-2 px-4 text-right">Since</th>
                </tr>
              </thead>
              <tbody>
                {congress.executive.cabinet.map((c) => (
                  <tr key={c.office} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-4 text-[var(--text-muted)]">{c.office}</td>
                    <td className="py-2 px-4 font-medium text-[var(--text)]">{c.name}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)]">{c.since?.slice(0, 4) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section id="governors" className="mb-12 scroll-mt-20">
        <h2 className="text-xl font-bold mb-1 text-[var(--text)]">Governors</h2>
        <p className="text-sm text-[var(--text-dim)] mb-3">
          {stateRows.length} states ·{" "}
          <span className="text-red-700 dark:text-red-400">{rep} Republican</span> ·{" "}
          <span className="text-blue-700 dark:text-blue-400">{dem} Democratic</span>. Metro score is the
          population-weighted sum of the state&rsquo;s metros (cross-state metros split by population share).
        </p>
        <GovernorsTable rows={stateRows} nameHeader="State" />
        <h3 className="text-sm font-semibold text-[var(--text-muted)] mt-6 mb-2">US Territories</h3>
        <GovernorsTable rows={terrRows} nameHeader="Territory" />
      </section>

      {congress ? (
        <section id="senate" className="mb-12 scroll-mt-20">
          <h2 className="text-xl font-bold mb-2 text-[var(--text)]">United States Senate</h2>
          <PartySplitBar split={congress.senate.partySplit} />
          <p className="text-xs text-[var(--text-dim)] mb-3">
            Each senator&rsquo;s Metro score is the state&rsquo;s population-weighted metro score divided by two, since a
            state&rsquo;s two senators share its representation.
          </p>
          <SenatorsTable rows={senRows} />
        </section>
      ) : null}

      {congress ? (
        <section id="house" className="mb-12 scroll-mt-20">
          <h2 className="text-xl font-bold mb-2 text-[var(--text)]">House of Representatives</h2>
          <PartySplitBar split={congress.house.partySplit} />
          <h3 className="text-sm font-semibold text-[var(--text-muted)] mb-2">Leadership</h3>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
                  <th className="py-2 px-4">Office</th>
                  <th className="py-2 px-4">Representative</th>
                  <th className="py-2 px-4">Party</th>
                </tr>
              </thead>
              <tbody>
                {congress.house.leadership.map((l) => (
                  <tr key={l.office} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-4 text-[var(--text-muted)]">{l.office}</td>
                    <td className="py-2 px-4 font-medium text-[var(--text)]">{l.name}</td>
                    <td className={`py-2 px-4 font-medium ${partyTextClass(l.party)}`}>{l.party}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <footer className="mt-6 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Federal officeholders reflect the 119th Congress and the current administration as of mid-2026. Governors current as
        of mid-2026; DC is led by a mayor and is not listed among governors. State Metro score is the population-weighted sum
        of the Metro Power scores of the metros in the state.
      </footer>
    </main>
  );
}

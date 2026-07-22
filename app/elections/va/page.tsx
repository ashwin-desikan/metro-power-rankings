import type { Metadata } from "next";
import Link from "next/link";
import {
  getVaElections,
  computeVaRecords,
  VA_ERAS,
  vaEraKeyOf,
  vaDuration,
  vaFmtInt,
  type Conclave,
} from "@/lib/vaElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { StatTile, JumpNav, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/va";
const TITLE = "Papal Conclaves";
const DESC =
  "Almost a millennium of the world's oldest surviving electoral system: every papal election since the cardinals became the electorate in 1059 — the 33-month deadlock that invented the conclave, the schism that produced three rival popes, the crown vetoes and marathon stalemates, and the two-day conclaves of the modern age, through Leo XIV in 2025.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function ConclaveRow({ c }: { c: Conclave }) {
  const maxDays = 120; // bar scale cap; the epic deadlocks read from the label
  const barW = c.days != null ? Math.min(100, (c.days / maxDays) * 100) : 0;
  return (
    <Link
      href={`/elections/va/${c.id}`}
      className="block rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-[var(--text)]">{c.label}</span>
          <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            {c.kind === "conclave" ? "conclave" : "papal election"}
          </span>
          <span className="text-xs text-[var(--text-dim)]">{c.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3 flex-wrap">
          <span>
            <span className="font-semibold" style={{ color: "#D4AF37" }}>{c.pope}</span>
            {c.birthName ? <span className="text-[var(--text-dim)]"> · {c.birthName}</span> : null}
          </span>
          {c.days != null ? <span>{vaDuration(c)}</span> : null}
          {c.ballots != null ? <span>{c.ballots} {c.ballots === 1 ? "ballot" : "ballots"}</span> : null}
          {c.electors != null ? <span>{c.electors} electors</span> : null}
        </div>
      </div>
      {c.days != null ? (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(barW, 2)}%`, backgroundColor: c.days > 30 ? "#B4540A" : "#D4AF37" }}
            title={`${vaDuration(c)} of deliberation`}
          />
        </div>
      ) : null}
    </Link>
  );
}

export default function VaElectionsPage() {
  const { elections, meta } = getVaElections();
  const records = computeVaRecords();
  const latest = elections[elections.length - 1];
  const conclaves = elections.filter((e) => e.kind === "conclave").length;

  const byEra = VA_ERAS.map((era) => ({
    era,
    list: elections.filter((e) => vaEraKeyOf(e.year) === era.key).slice().reverse(),
  })).filter(({ list }) => list.length > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Vatican</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="va" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div
        className="rounded-xl border p-4 mb-8 max-w-3xl text-sm"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
      >
        <p className="text-[var(--text-muted)]">
          <span className="font-bold text-[var(--text)]">How to read this hub.</span>{" "}
          A conclave is an election with no parties, no campaign and an electorate of around a
          hundred men choosing an absolute monarch for life — the one contest in this atlas where
          secrecy is the design rather than the defect. The record here is what the Church itself
          documents: dates, duration, electors, ballots where known, and the pope produced. Votes
          cast for individual candidates are burned, so the tables of this hub count days and
          ballots instead.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Elections recorded" value={vaFmtInt(elections.length)} hint={`1061–2025, of which ${conclaves} were conclaves under the locked-door rules`} />
        <StatTile label="Span" value="964 yrs" hint="the oldest electoral system still in continuous use" />
        <StatTile label="Longest deadlock" value="33 mo" hint="1268–71 — ended by a removed roof, cut rations and a compromise committee" />
        <StatTile label="The latest" value={latest.label} hint={`${latest.pope}, elected on the ${latest.ballots ?? "?"}th ballot by ${latest.electors ?? "?"} electors`} />
      </div>

      <JumpNav items={[["#chronology", "Every conclave"], ["#records", "The numbers to know"], ["#how-it-works", "How a conclave works"]]} />

      {/* ---------- chronology ---------- */}
      <section id="chronology" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Every conclave and papal election</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Newest first within each era. The bar under each entry is the length of the gathering —
          gold for the routine, amber for the deadlocks that ran past a month.
        </p>
        {byEra.map(({ era, list }) => (
          <div key={era.key} id={`era-${era.key}`} className="mb-8">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-[var(--text)]">
                {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
            </div>
            <div className="grid gap-2">
              {list.map((c) => <ConclaveRow key={c.id} c={c} />)}
            </div>
          </div>
        ))}
      </section>

      <RecordsGrid records={records} hrefBase={PATH} headline="The numbers to know" />

      <HowItWorks
        title="How a conclave works"
        cards={[
          ["The electorate", "Cardinals under the age of eighty — 133 of them in 2025, appointed by previous popes and drawn from over seventy countries. Before 1059 popes were chosen by Roman clergy, mobs and emperors; In nomine Domini gave the choice to the cardinals, and Ubi periculum (1274) locked them in until they decided."],
          ["The rules", "Two-thirds of the votes present, by secret written ballot in the Sistine Chapel, up to four ballots a day. Black smoke means no decision; white smoke, with the bells of St Peter's, means a pope. The elected man need not be a cardinal — though every one since 1378 has been."],
          ["The pressure of the lock", "The word conclave means 'with a key'. The rules exist because medieval elections ran for years: Viterbo's magistrates removed the roof over the cardinals in 1270 and cut their food to bread and water. Modern conclaves feel the same pressure politely — none since 1831 has lasted a week."],
          ["Why it belongs in this atlas", "It is the oldest continuously operating electoral system on earth, and the purest counter-example: a real election with no electorate to persuade beyond the room itself. Its history — vetoes by kings, factions of crowns, schisms with three simultaneous winners — is electoral politics distilled."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/leaders/vatican-city", "Vatican leadership history"],
          ["/elections/it", "Italian Elections"],
          ["/orgs", "International Organisations"],
          ["/rankings/rome", "Rome in the metro rankings"],
        ]}
      />
    </main>
  );
}

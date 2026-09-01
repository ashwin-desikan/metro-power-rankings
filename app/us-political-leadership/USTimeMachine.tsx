"use client";
import { useMemo, useState } from "react";

type Dated = { name: string; party: string; start: string; end: string | null };
type House = {
  congress: number;
  years: string;
  start: string;
  end: string;
  total: number;
  parties: { party: string; seats: number }[];
};
type SenTerm = {
  name: string;
  state: string;
  class: number;
  party: string;
  start: string;
  end: string | null;
};
type CabinetOffice = { office: string; holders: Dated[] };
type Justice = {
  n: number;
  name: string;
  born: number;
  died: number | null;
  position: string;
  start: string;
  end: string | null;
  appointer: string | null;
};

// Party names arrive in two styles: Wikidata ("Republican Party",
// "independent politician") and Wikipedia/hand-built ("Republican", "Democrat").
// normParty folds both to one canonical label used for colour AND display.
const PARTY_ALIAS: Record<string, string> = {
  democrat: "Democratic",
  "independent politician": "Independent",
  independent: "Independent",
  "no parties": "Nonpartisan",
  "non-partisan": "Nonpartisan",
  nonpartisan: "Nonpartisan",
  "-": "Unknown",
  "": "Unknown",
};
function normParty(p?: string): string {
  if (!p) return "Unknown";
  const stripped = p.replace(/\s+Party$/i, "").trim();
  const low = stripped.toLowerCase();
  // Reconstruction-era military/provisional appointees carry non-party labels.
  if (/military|provisional|occupation|appointed by/.test(low)) return "Nonpartisan";
  return PARTY_ALIAS[low] ?? stripped;
}

const PARTY_COLOR: Record<string, string> = {
  Republican: "#b91c1c",
  Democratic: "#1d4ed8",
  "Democratic-Republican": "#059669",
  "Democratic-Farmer-Labor": "#1e40af",
  Federalist: "#7c3aed",
  Whig: "#d97706",
  Jacksonian: "#0891b2",
  Jackson: "#0891b2",
  "Anti-Jacksonian": "#be185d",
  "Anti-Administration": "#9ca3af",
  "Pro-Administration": "#4b5563",
  Adams: "#0d9488",
  "National Republican": "#8b5cf6",
  "National Union": "#6b7280",
  Nullifier: "#a16207",
  "Free Soil": "#166534",
  Unionist: "#334155",
  "Unconditional Unionist": "#334155",
  "Liberal Republican": "#c026d3",
  Populist: "#15803d",
  Silver: "#94a3b8",
  "Silver Republican": "#a78bfa",
  Readjuster: "#b45309",
  "Farmer-Labor": "#047857",
  Progressive: "#ea580c",
  Conservative: "#1e3a8a",
  American: "#ca8a04",
  Opposition: "#ca8a04",
  Independent: "#6b7280",
  Unaffiliated: "#6b7280",
  Nonpartisan: "#6b7280",
  Other: "#9ca3af",
  Unknown: "#9ca3af",
};
const colorOf = (p: string) => PARTY_COLOR[normParty(p)] ?? "#9ca3af";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const ORD = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

function onDate(list: Dated[], d: string): Dated | null {
  return list.find((o) => o.start <= d && (o.end == null || d < o.end)) ?? null;
}

function Card({ label, office }: { label: string; office: Dated | null }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
        {label}
      </p>
      {office ? (
        <>
          <p className="text-lg font-bold text-[var(--text)]">{office.name}</p>
          <p className="text-xs text-[var(--text-muted)]">
            <span style={{ color: colorOf(office.party) }}>{normParty(office.party)}</span>{" "}
            · {office.start.slice(0, 4)}–{office.end ? office.end.slice(0, 4) : "present"}
          </p>
        </>
      ) : (
        <p className="text-lg font-bold text-[var(--text-dim)] italic">Vacant</p>
      )}
    </div>
  );
}

function BalanceBar({
  parties,
  total,
}: {
  parties: { party: string; seats: number }[];
  total: number;
}) {
  return (
    <>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--border)" }}
      >
        {parties.map((p) => (
          <div
            key={p.party}
            style={{
              width: `${(p.seats / total) * 100}%`,
              backgroundColor: colorOf(p.party),
            }}
            title={`${p.party}: ${p.seats}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mt-2 text-sm">
        {parties.map((p) => (
          <span key={p.party} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: colorOf(p.party) }}
            />
            <span className="font-semibold text-[var(--text)] tabular-nums">
              {p.seats}
            </span>
            <span className="text-[var(--text-muted)]">{p.party}</span>
          </span>
        ))}
      </div>
    </>
  );
}

// Tally a set of active office-holders into a party-balance list (normalized,
// sorted desc). Used for both the Senate and the governors.
function tally(rows: { party: string }[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const p = normParty(r.party);
    m.set(p, (m.get(p) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([party, seats]) => ({ party, seats }))
    .sort((a, b) => b.seats - a.seats || a.party.localeCompare(b.party));
}

export default function USTimeMachine({
  presidents,
  vicePresidents,
  house,
  senate = [],
  cabinet = [],
  governors = {},
  scotus = [],
  constitution,
}: {
  presidents: Dated[];
  vicePresidents: Dated[];
  house: House[];
  senate?: SenTerm[];
  cabinet?: CabinetOffice[];
  governors?: Record<string, Dated[]>;
  /** The document in force, and how many presidents had served under it. */
  constitution?: { adopted: number; total: number };
  scotus?: Justice[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const MIN_DATE = "1789-04-30";
  const [date, setDate] = useState(today);
  // What the input currently shows. Kept separate from the applied date so
  // typing a year is never interrupted: a controlled date input reports
  // partial years while they're being keyed ("19…" arrives as 0019), and
  // clamping those mid-keystroke resets the field so a date can never be
  // typed. Complete in-range values apply live; the rest settle on blur.
  const [draft, setDraft] = useState(today);

  const pres = onDate(presidents, date);
  const vp = onDate(vicePresidents, date);
  const cong = house.find((h) => h.start <= date && date < h.end) ?? null;

  // Which president is this, counting from the constitution's adoption? The
  // count is of terms begun, so a president serving non-consecutive terms is
  // counted each time they arrive, which is how the presidency is numbered.
  const underConstitution = useMemo(() => {
    if (!constitution) return null;
    const started = presidents.filter(
      (x) => x.start.slice(0, 4) >= String(constitution.adopted) && x.start <= date,
    );
    return { nth: started.length, of: constitution.total, adopted: constitution.adopted };
  }, [presidents, date, constitution]);

  const cabinetOnDate = useMemo(
    () => cabinet.map((c) => ({ office: c.office, holder: onDate(c.holders, date) })),
    [cabinet, date],
  );

  const senateOnDate = useMemo(() => {
    const active = senate.filter(
      (s) => s.start <= date && (s.end == null || date < s.end),
    );
    const byState = new Map<string, SenTerm[]>();
    for (const s of active) {
      const arr = byState.get(s.state) ?? [];
      arr.push(s);
      byState.set(s.state, arr);
    }
    const states = [...byState.keys()].sort((a, b) =>
      (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b),
    );
    return { total: active.length, parties: tally(active), byState, states };
  }, [senate, date]);

  const benchOnDate = useMemo(() => {
    return scotus
      .filter((j) => j.start <= date && (j.end == null || date < j.end))
      .sort((a, b) =>
        a.position === b.position
          ? a.start.localeCompare(b.start)
          : a.position === "Chief Justice" ? -1 : 1,
      );
  }, [scotus, date]);

  const govOnDate = useMemo(() => {
    const hits: { code: string; gov: Dated }[] = [];
    for (const code of Object.keys(governors)) {
      const g = onDate(governors[code], date);
      if (g) hits.push({ code, gov: g });
    }
    hits.sort((a, b) =>
      (STATE_NAMES[a.code] ?? a.code).localeCompare(STATE_NAMES[b.code] ?? b.code),
    );
    return { total: hits.length, parties: tally(hits.map((h) => h.gov)), hits };
  }, [governors, date]);

  return (
    <section id="time-machine" className="mb-12 scroll-mt-20">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="date"
          value={draft}
          min={MIN_DATE}
          max={today}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            if (v && v >= MIN_DATE && v <= today) setDate(v);
          }}
          onBlur={() => {
            const c = !draft ? date : draft > today ? today : draft < MIN_DATE ? MIN_DATE : draft;
            setDraft(c);
            setDate(c);
          }}
          className="rounded-lg border px-3 py-2 text-sm text-[var(--text)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        />
        <span className="text-sm text-[var(--text-muted)]">{fmtDate(date)}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <Card label="President" office={pres} />
        <Card label="Vice President" office={vp} />
      </div>

      {underConstitution && underConstitution.nth > 0 ? (
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Serving under the constitution of {underConstitution.adopted}, which by this date had
          seen{" "}
          <span className="font-semibold text-[var(--text)] tabular-nums">
            {underConstitution.nth}
          </span>{" "}
          president{underConstitution.nth === 1 ? "" : "s"} take office, and has seen{" "}
          {underConstitution.of} in all.{" "}
          <a href="/constitutions/leaders" className="text-[var(--accent)] hover:underline">
            How that compares →
          </a>
        </p>
      ) : null}

      {cabinetOnDate.length > 0 ? (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">
            Cabinet
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cabinetOnDate.map((c) => (
              <Card key={c.office} label={c.office} office={c.holder} />
            ))}
          </div>
        </div>
      ) : null}

      {benchOnDate.length > 0 ? (
        <div
          className="rounded-xl border p-4 mb-4"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
              Supreme Court
            </p>
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              {benchOnDate.length} justices
            </p>
          </div>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {benchOnDate.map((j) => (
              <div key={`${j.n}-${j.position}`} className="text-xs">
                <p className="font-semibold text-[var(--text)]">
                  {j.name}
                  {j.position === "Chief Justice" ? (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Chief</span>
                  ) : null}
                </p>
                <p className="text-[var(--text-muted)]">
                  {j.start.slice(0, 4)}–{j.end ? j.end.slice(0, 4) : "present"} · appointed by {j.appointer ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {cong ? (
        <div
          className="rounded-xl border p-4 mb-4"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
              {ORD(cong.congress)} Congress · House ({cong.years})
            </p>
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              {cong.total} seats
            </p>
          </div>
          <BalanceBar parties={cong.parties} total={cong.total} />
        </div>
      ) : null}

      {senateOnDate.total > 0 ? (
        <div
          className="rounded-xl border p-4 mb-4"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
              U.S. Senate
            </p>
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              {senateOnDate.total} seated
            </p>
          </div>
          <BalanceBar parties={senateOnDate.parties} total={senateOnDate.total} />

          <div className="grid gap-x-6 gap-y-3 mt-4 sm:grid-cols-2 lg:grid-cols-3">
            {senateOnDate.states.map((code) => {
              const seats = senateOnDate.byState.get(code)!;
              seats.sort((a, b) => a.class - b.class);
              return (
                <div key={code}>
                  <p className="text-xs font-semibold text-[var(--text)] mb-0.5">
                    {STATE_NAMES[code] ?? code}
                  </p>
                  {seats.map((s, i) => (
                    <p
                      key={`${s.name}-${s.class}-${i}`}
                      className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: colorOf(s.party) }}
                        title={normParty(s.party)}
                      />
                      <span>{s.name}</span>
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {govOnDate.total > 0 ? (
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
              State Governors
            </p>
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              {govOnDate.total} states
            </p>
          </div>
          <BalanceBar parties={govOnDate.parties} total={govOnDate.total} />

          <div className="grid gap-x-6 gap-y-2 mt-4 sm:grid-cols-2 lg:grid-cols-3">
            {govOnDate.hits.map(({ code, gov }) => (
              <div key={code} className="flex items-baseline gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0 translate-y-[-1px]"
                  style={{ backgroundColor: colorOf(gov.party) }}
                  title={normParty(gov.party)}
                />
                <span className="text-xs font-semibold text-[var(--text)] shrink-0">
                  {STATE_NAMES[code] ?? code}:
                </span>
                <span className="text-xs text-[var(--text-muted)]">{gov.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-[var(--text-dim)] mt-3">
        President, Vice President, the big-four Cabinet, the Supreme Court bench,
        House balance, Senate membership and state governors are shown for the
        selected date. Cabinet counts include acting secretaries. Governors appear
        from statehood onward. The Court&apos;s size has ranged from five sitting
        justices to ten; the judiciary carries no party labels.
      </p>
    </section>
  );
}

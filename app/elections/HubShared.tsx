import Link from "next/link";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { ELECTION_HUBS, HUB_CAPITALS } from "@/lib/electionHubsMeta";

// Shared server-side building blocks for the election hub pages.
// Purely presentational; each hub page supplies its own data, colors and prose.

// Bordered pill-style back/navigation button, used at the top of every hub
// and detail page so returning never requires scrolling to the bottom.
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <span aria-hidden>←</span> {label}
    </Link>
  );
}

// Top-of-page pager for detail pages: back to the hub plus previous/next
// election, mirrored again at the bottom of the page.
export function DetailPager({
  hubHref,
  hubName,
  prev,
  next,
  suffix,
}: {
  hubHref: string;
  hubName: string;
  prev: { id: string; label: string } | null;
  next: { id: string; label: string } | null;
  suffix?: string;
}) {
  const tag = suffix ? ` ${suffix}` : "";
  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      <BackButton href={hubHref} label={`All ${hubName} elections`} />
      <div className="ml-auto flex items-center gap-2">
        {prev ? <BackButton href={`${hubHref}/${prev.id}`} label={`${prev.label}${tag}`} /> : null}
        {next ? (
          <Link
            href={`${hubHref}/${next.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
          >
            {next.label}{tag} <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// Flag image + title + next-election line for a hub header. Flags are always
// images, never emoji (Windows renders flag emoji as letter pairs).
export function HubTitle({ code, title }: { code: string; title: string }) {
  const meta = ELECTION_HUBS[code];
  return (
    <>
      <div className="mb-3">
        <BackButton href="/elections" label="All election hubs" />
      </div>
      <div className="flex items-center gap-3 mb-2">
        {meta ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flagUrlByCode(meta.flag)}
            srcSet={flagSrcSetByCode(meta.flag)}
            alt={`Flag of ${meta.name}`}
            width={40}
            height={30}
            className="rounded-sm border shrink-0"
            style={{ borderColor: "var(--border)" }}
          />
        ) : null}
        <h1 className="text-3xl font-bold text-[var(--text)]">{title}</h1>
        {meta?.note ? (
          <span
            className="text-[10px] uppercase tracking-wider rounded-full border px-2.5 py-1 shrink-0 font-semibold"
            style={meta.noteTone === "neutral"
              ? { borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg-card)" }
              : { borderColor: "#B4540A", color: "#D97706", backgroundColor: "rgba(217,119,6,0.08)" }}
            title={meta.noteTone === "neutral"
              ? "A descriptive label, not a fairness warning."
              : "National votes here are not free, competitive contests — every entry carries the honest label."}
          >
            {meta.note}
          </span>
        ) : null}
      </div>
      {meta ? (
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">
          Next election{" · "}
          <span className="text-[var(--text-muted)]">{meta.next}</span>
          {HUB_CAPITALS[code] ? (
            <>
              {"   ·   Capital · "}
              <Link
                href={`/rankings/${HUB_CAPITALS[code].slug}`}
                className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline"
              >
                {HUB_CAPITALS[code].name} in the metro rankings →
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

export type HubParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange?: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
  alliance?: string | null;
};
export type HubElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: HubParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  unfree?: "partial" | "unfree" | null;
  // Free-text framing for contests that were not free or fully representative
  // (restricted franchises, managed or indirect votes). Rendered prominently.
  caveat?: string | null;
};
export type HubEra = { key: string; label: string; span: string; blurb: string };
export type HubRecord = { label: string; value: string; electionId: string; detail: string };

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text)] tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p> : null}
    </div>
  );
}

export function SeatStrip({ e, colorOf }: { e: HubElection; colorOf: (n: string | null | undefined) => string }) {
  const total = e.totalSeats;
  if (!total) return null;
  const withSeats = e.parties.filter((p) => p.seats != null && p.seats > 0);
  const known = withSeats.reduce((s, p) => s + (p.seats ?? 0), 0);
  const rest = Math.max(0, total - known);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
      {withSeats.map((p, i) => (
        <div
          key={`${p.name}-${i}`}
          style={{
            width: `${((p.seats ?? 0) / total) * 100}%`,
            backgroundColor: colorOf(p.name),
            marginRight: i < withSeats.length - 1 || rest > 0 ? 1 : 0,
          }}
          title={`${p.name}: ${p.seats} seats`}
        />
      ))}
      {rest > 0 ? <div style={{ width: `${(rest / total) * 100}%`, backgroundColor: "#3a3a4a" }} title={`Others / not shown: ${rest} seats`} /> : null}
    </div>
  );
}

export function Chronology({
  eras,
  elections,
  hrefBase,
  colorOf,
  fmtPct,
  headline,
  intro,
  leaderTag,
}: {
  eras: HubEra[];
  elections: HubElection[];
  hrefBase: string; // e.g. "/elections/au"
  colorOf: (n: string | null | undefined) => string;
  fmtPct: (n: number | null | undefined, dp?: number) => string;
  headline?: string;
  intro?: string;
  leaderTag: string; // "PM" | "Chancellor"
}) {
  // Newest era first, and newest election first within each era.
  const byEra = [...eras]
    .reverse()
    .map((era) => ({ era, list: elections.filter((e) => e.era === era.key).slice().reverse() }))
    .filter(({ list }) => list.length > 0);
  return (
    <section id="chronology" className="mb-12">
      <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">{headline ?? "The chronology"}</h2>
      {intro ? <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">{intro}</p> : null}
      {byEra.map(({ era, list }) => (
        <div key={era.key} id={`era-${era.key}`} className="mb-8">
          <div className="mb-3">
            <h3 className="text-lg font-bold text-[var(--text)]">
              {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
            </h3>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
          </div>
          <div className="grid gap-2">
            {list.map((e) => {
              const winner = e.parties.find((p) => p.name === e.seatLeader) ?? e.parties[0];
              return (
                <Link
                  key={e.id}
                  href={`${hrefBase}/${e.id}`}
                  className="block rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-bold text-[var(--text)]">{e.label}</span>
                      {e.knownAs ? (
                        <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
                          {e.knownAs}
                        </span>
                      ) : null}
                      <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
                      {winner && winner.seats != null ? (
                        <span>
                          <span style={{ color: colorOf(winner.name) }}>{winner.name}</span>{" "}
                          {winner.seats}
                          {e.totalSeats ? `/${e.totalSeats}` : ""}
                        </span>
                      ) : null}
                      {e.turnout != null ? <span>turnout {fmtPct(e.turnout)}</span> : null}
                      {e.pmAfter ? <span>{leaderTag}: {e.pmAfter.name}</span> : null}
                    </div>
                  </div>
                  <SeatStrip e={e} colorOf={colorOf} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

export function RecordsGrid({ records, hrefBase, headline }: { records: HubRecord[]; hrefBase: string; headline?: string }) {
  return (
    <section id="records" className="mb-12">
      <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">{headline ?? "Records & superlatives"}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {records.map((r) => (
          <Link
            key={r.label}
            href={`${hrefBase}/${r.electionId}`}
            className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
          >
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{r.label}</p>
            <p className="text-xl font-bold text-[var(--text)] tabular-nums">{r.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{r.detail}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function HowItWorks({ title, cards }: { title: string; cards: [string, string][] }) {
  return (
    <section id="how-it-works" className="mb-10">
      <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        {cards.map(([h, b]) => (
          <div key={h} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <p className="font-bold text-[var(--text)] mb-1">{h}</p>
            <p className="text-xs text-[var(--text-muted)]">{b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HubFooter({ sources, links }: { sources: string[]; links: [string, string][] }) {
  return (
    <footer className="text-xs text-[var(--text-dim)] border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <p>Sources: {sources.join("; ")}.</p>
      <p className="mt-1">
        See also{" "}
        {links.map(([href, label], i) => (
          <span key={href}>
            {i > 0 ? " · " : ""}
            <Link href={href} className="text-[var(--accent)] hover:underline">{label}</Link>
          </span>
        ))}
      </p>
    </footer>
  );
}

export function JumpNav({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-2 mb-10 text-xs">
      {items.map(([href, label]) => (
        <a key={href} href={href} className="rounded-full border px-3 py-1 text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)" }}>
          {label}
        </a>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import {
  RADAR_POINTS,
  SLATE_POINTS,
  computeLeaderboard,
  eventKey,
  gradeRadar,
  gradeSlate,
  isLocked,
  pickProb,
  radarGames,
  radarVerdict,
  type LedgerEntry,
  type LedgerFile,
  type PickCode,
  type PicksLeague,
  type RadarSide,
  type StoredPick,
} from "@/lib/picksGame";

// ---------------------------------------------------------------------------
// Data: same GitHub-raw-first pattern as lib/plSim.ts, but in the browser so
// picks grade against the freshest graded ledger without waiting on a build.
// ---------------------------------------------------------------------------

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

async function fetchLedger(file: string): Promise<LedgerFile | null> {
  for (const base of [GH_BASE, "/data"]) {
    try {
      const res = await fetch(`${base}/${file}`, { cache: "no-store" });
      if (res.ok) return (await res.json()) as LedgerFile;
    } catch {
      /* try next source */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pick storage: localStorage signed out, Supabase `picks` signed in, local
// picks merged up on first sign-in — the exact useFollowing contract.
// ---------------------------------------------------------------------------

const LOCAL_KEY = "con-picks-v1";

type PickUser = { id: string; name: string | null; avatar: string | null };

function readLocal(): StoredPick[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter((x) => x && x.league && x.event_key && x.pick) : [];
  } catch {
    return [];
  }
}
function writeLocal(items: StoredPick[]) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(u: any): PickUser {
  const m = (u && u.user_metadata) || {};
  return {
    id: u.id,
    name: m.full_name ?? m.name ?? u.email ?? null,
    avatar: m.avatar_url ?? m.picture ?? null,
  };
}

const keyOf = (p: StoredPick) => `${p.league}:${p.season}:${p.event_key}:${p.mode}`;

// ---------------------------------------------------------------------------

const CARD = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const MONO = { fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" } as const;

type Tab = "slate" | "confidence" | "radar" | "season";

const LEAGUE_META: Record<PicksLeague, { label: string; emoji: string; note: string; file: string; ways: 2 | 3 }> = {
  pl: { label: "Premier League", emoji: "\u{26BD}", note: "Matchweek slate · three-way", file: "pl-predictions.json", ways: 3 },
  nfl: { label: "NFL", emoji: "\u{1F3C8}", note: "Weekly slate · two-way", file: "nfl-predictions.json", ways: 2 },
};

const COMING: { label: string; emoji: string; note: string }[] = [
  { label: "CFB", emoji: "\u{1F3C8}", note: "with the preseason poll" },
  { label: "MLB Postseason", emoji: "\u{26BE}", note: "series + game picks in October" },
  { label: "UCL", emoji: "\u{1F3C6}", note: "after the draw" },
];

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

function modelPickLabel(league: PicksLeague, e: LedgerEntry): string {
  if (league === "pl") {
    const { pH, pD = 0, pA = 0 } = e.model;
    const top = Math.max(pH, pD, pA);
    return top === pH ? e.home : top === pA ? e.away : "Draw";
  }
  return e.model.pH >= 0.5 ? e.home : e.away;
}

function resultLabel(e: LedgerEntry): string {
  if (e.result === "H") return e.home;
  if (e.result === "A") return e.away;
  if (e.result === "T") return "Tie";
  return "Draw";
}

export default function PicksClient() {
  const sb = getSupabase();
  const [tab, setTab] = useState<Tab>("slate");
  const [league, setLeague] = useState<PicksLeague>("pl");
  const [ledgers, setLedgers] = useState<Partial<Record<PicksLeague, LedgerFile>>>({});
  const [picks, setPicks] = useState<StoredPick[]>([]);
  const [user, setUser] = useState<PickUser | null>(null);
  const [ready, setReady] = useState(false);
  const [board, setBoard] = useState<{ rows: (StoredPick & { user_id: string })[]; names: Map<string, string> } | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const userRef = useRef<PickUser | null>(null);
  userRef.current = user;

  // Ledgers
  useEffect(() => {
    let mounted = true;
    Promise.all([fetchLedger("pl-predictions.json"), fetchLedger("nfl-predictions.json")]).then(([pl, nfl]) => {
      if (!mounted) return;
      setLedgers({ pl: pl ?? undefined, nfl: nfl ?? undefined });
    });
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const seasonOf = useCallback(
    (lg: PicksLeague) => String(ledgers[lg]?.meta.season ?? ""),
    [ledgers],
  );

  // Auth + pick sync (useFollowing skeleton). RLS makes picks world-readable
  // for the leaderboard, so "my picks" MUST filter on user_id — without it,
  // every other player's rows come back as yours.
  const loadFromDb = useCallback(async (userId: string) => {
    if (!sb) return;
    const { data } = await sb
      .from("picks")
      .select("league,season,event_key,mode,pick,confidence,picked_at")
      .eq("user_id", userId)
      .order("picked_at", { ascending: true });
    setPicks((data as StoredPick[]) || []);
  }, [sb]);

  const syncUser = useCallback(
    async (u: PickUser | null) => {
      setUser(u);
      userRef.current = u;
      if (u && sb) {
        if (u.name) {
          await sb.from("pick_profiles").upsert(
            { user_id: u.id, display_name: u.name.slice(0, 60), updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        }
        const local = readLocal();
        if (local.length) {
          // ON CONFLICT DO NOTHING: never clobber a db pick, and never restamp
          // picked_at on rows that already beat the lock.
          await sb.from("picks").upsert(
            local.map((p) => ({ user_id: u.id, league: p.league, season: p.season, event_key: p.event_key, mode: p.mode, pick: p.pick, confidence: p.confidence })),
            { onConflict: "user_id,league,season,event_key,mode", ignoreDuplicates: true },
          );
        }
        await loadFromDb(u.id);
      } else {
        setPicks(readLocal());
      }
    },
    [sb, loadFromDb],
  );

  useEffect(() => {
    let mounted = true;
    setPicks(readLocal());
    if (!sb) {
      setReady(true);
      return;
    }
    sb.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      await syncUser(data.session?.user ? mapUser(data.session.user) : null);
      if (mounted) setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      syncUser(session?.user ? mapUser(session.user) : null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  const signIn = useCallback(() => {
    if (!sb) return;
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }, [sb]);
  const signOut = useCallback(async () => {
    if (sb) await sb.auth.signOut();
    setUser(null);
    userRef.current = null;
    setPicks(readLocal());
  }, [sb]);

  // Writes
  const upsertPick = useCallback(
    async (next: StoredPick) => {
      setPicks((prev) => {
        const rest = prev.filter((p) => keyOf(p) !== keyOf(next));
        const out = [...rest, next];
        if (!userRef.current) writeLocal(out);
        return out;
      });
      const u = userRef.current;
      if (u && sb) {
        await sb.from("picks").upsert(
          { user_id: u.id, league: next.league, season: next.season, event_key: next.event_key, mode: next.mode, pick: next.pick, confidence: next.confidence },
          { onConflict: "user_id,league,season,event_key,mode" },
        );
      }
    },
    [sb],
  );

  const removePick = useCallback(
    async (p: StoredPick) => {
      setPicks((prev) => {
        const out = prev.filter((x) => keyOf(x) !== keyOf(p));
        if (!userRef.current) writeLocal(out);
        return out;
      });
      const u = userRef.current;
      if (u && sb) {
        await sb
          .from("picks")
          .delete()
          .eq("league", p.league)
          .eq("season", p.season)
          .eq("event_key", p.event_key)
          .eq("mode", p.mode);
      }
    },
    [sb],
  );

  // Leaderboard data (signed-in only; RLS makes picks world-readable)
  useEffect(() => {
    if (!sb || tab !== "season") return;
    let mounted = true;
    (async () => {
      const [{ data: rows }, { data: profs }] = await Promise.all([
        sb.from("picks").select("user_id,league,season,event_key,mode,pick,confidence,picked_at").limit(20000),
        sb.from("pick_profiles").select("user_id,display_name").limit(2000),
      ]);
      if (!mounted) return;
      const names = new Map<string, string>();
      for (const p of (profs as { user_id: string; display_name: string }[]) || []) names.set(p.user_id, p.display_name);
      setBoard({ rows: (rows as (StoredPick & { user_id: string })[]) || [], names });
    })();
    return () => {
      mounted = false;
    };
  }, [sb, tab]);

  // Derived
  const entries = useMemo(() => ledgers[league]?.ledger ?? [], [ledgers, league]);
  const slatePicks = useMemo(() => {
    const m = new Map<string, StoredPick>();
    for (const p of picks) if (p.mode === "slate") m.set(`${p.league}:${p.event_key}`, p);
    return m;
  }, [picks]);
  const radarPicks = useMemo(() => {
    const m = new Map<string, StoredPick>();
    for (const p of picks) if (p.mode === "radar") m.set(p.event_key, p);
    return m;
  }, [picks]);

  const pickFor = useCallback(
    (lg: PicksLeague, e: LedgerEntry) => slatePicks.get(`${lg}:${eventKey(lg, e)}`),
    [slatePicks],
  );

  const grade = useMemo(
    () => gradeSlate(picks, { pl: ledgers.pl?.ledger, nfl: ledgers.nfl?.ledger }),
    [picks, ledgers],
  );
  const radarGrade = useMemo(() => gradeRadar(picks, ledgers.nfl?.ledger ?? []), [picks, ledgers]);

  // Confidence ordering: distinct slots n..1 across THIS league's picked,
  // unlocked games; locked rows keep their stored slot.
  const setConfidenceOrder = useCallback(
    (lg: PicksLeague, orderedKeys: string[]) => {
      const led = ledgers[lg]?.ledger ?? [];
      const byKey = new Map(led.map((e) => [eventKey(lg, e), e]));
      const n = orderedKeys.length + picks.filter((p) => {
        if (p.mode !== "slate" || p.league !== lg) return false;
        const e = byKey.get(p.event_key);
        return !!e && isLocked(e, now) && !orderedKeys.includes(p.event_key);
      }).length;
      orderedKeys.forEach((k, i) => {
        const e = byKey.get(k);
        const p = slatePicks.get(`${lg}:${k}`);
        if (!e || !p || isLocked(e, now)) return;
        const slot = n - i;
        if (p.confidence !== slot) upsertPick({ ...p, confidence: slot, picked_at: new Date().toISOString() });
      });
    },
    [ledgers, picks, slatePicks, upsertPick, now],
  );

  const genAt = ledgers.pl?.meta.generated_at ?? ledgers.nfl?.meta.generated_at ?? "…";

  // -------------------------------------------------------------------------

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/play" className="hover:underline">Play</Link>
        {" / "}
        <Link href="/play/arcade" className="hover:underline">Games</Link>
        {" / "}
        <span>Citizen of Nowhere Picks</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{"\u{1F3AF}"} Citizen of Nowhere Picks</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          Call every game before the model&rsquo;s card is revealed. Score points, build a streak, beat the machine.
          The model&rsquo;s own picks come from the{" "}
          <Link href="/predictions" className="underline hover:text-[var(--accent)]">prediction hubs</Link>{" "}
          and are graded by the same rules.
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          model card {genAt} · picks lock at kickoff · graded from the prediction ledger
        </div>
      </header>

      <div className="flex gap-2 flex-wrap mb-5">
        {(
          [
            ["slate", "\u{1F4CB} The Slate"],
            ["confidence", "\u{1F39A}\u{FE0F} Confidence"],
            ["radar", "\u{1F6A8} Upset Radar"],
            ["season", "\u{1F3C6} My Season"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${tab === id ? "font-semibold" : "text-[var(--text-muted)] hover:border-[var(--accent-dim)]"}`}
            style={tab === id ? { background: "var(--accent)", color: "#08080D", borderColor: "var(--accent)" } : CARD}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === "slate" || tab === "confidence") && (
        <div className="flex gap-2 flex-wrap mb-4">
          {(Object.keys(LEAGUE_META) as PicksLeague[]).map((lg) => (
            <button
              key={lg}
              type="button"
              onClick={() => setLeague(lg)}
              className={`rounded-lg border px-3 py-1.5 text-sm text-left transition-colors ${league === lg ? "border-[var(--accent)] text-[var(--accent)] font-semibold" : "hover:border-[var(--accent-dim)]"}`}
              style={{ background: "var(--bg-card)", borderColor: league === lg ? undefined : "var(--border)" }}
            >
              {LEAGUE_META[lg].emoji} {LEAGUE_META[lg].label}
              <span className="block text-[10.5px] font-normal text-[var(--text-dim)]">{LEAGUE_META[lg].note}</span>
            </button>
          ))}
          {COMING.map((c) => (
            <span key={c.label} className="rounded-lg border px-3 py-1.5 text-sm opacity-45 cursor-not-allowed" style={CARD}>
              {c.emoji} {c.label}
              <span className="block text-[10.5px] text-[var(--text-dim)]">{c.note}</span>
            </span>
          ))}
        </div>
      )}

      {tab === "slate" && (
        <SlateTab
          league={league}
          entries={entries}
          now={now}
          pickFor={pickFor}
          seasonOf={seasonOf}
          upsertPick={upsertPick}
          removePick={removePick}
        />
      )}

      {tab === "confidence" && (
        <ConfidenceTab
          league={league}
          entries={entries}
          now={now}
          pickFor={pickFor}
          setConfidenceOrder={setConfidenceOrder}
        />
      )}

      {tab === "radar" && (
        <RadarTab
          nfl={ledgers.nfl?.ledger ?? []}
          now={now}
          radarPicks={radarPicks}
          seasonOf={seasonOf}
          upsertPick={upsertPick}
          removePick={removePick}
        />
      )}

      {tab === "season" && (
        <SeasonTab
          ready={ready}
          user={user}
          authEnabled={!!sb}
          signIn={signIn}
          signOut={signOut}
          grade={grade}
          radarGrade={radarGrade}
          board={board}
          ledgers={ledgers}
        />
      )}

      <div className="rounded-2xl border p-5 mt-10 text-[13.5px] text-[var(--text-muted)]" style={CARD}>
        <h3 className="text-sm font-semibold text-[var(--text)] mb-2">How this game works</h3>
        <p className="mb-2">
          <b>The Slate</b> pays {SLATE_POINTS} points per correct call — Premier League games are three-way (home, draw, away)
          and a correct draw call scores exactly like a correct win call; NFL games are two-way, and a tie grades nobody correct.
          Picks are blind: the model&rsquo;s probabilities reveal after you commit. <b>Confidence</b> ranks your slate — the slot
          value is a bonus on top of the base points when that pick lands. <b>Upset Radar</b> lists the games where our model and
          the betting market disagree most; side with either for +{RADAR_POINTS} when it grades closer to the result (lower Brier,
          the same metric the prediction hubs publish).
        </p>
        <p className="mb-2">
          Games lock at kickoff — or at 00:00 UTC on match day when the ledger carries no kickoff time. Signed out, picks live only in this browser. Sign in with Google (the same
          account that syncs your <Link href="/me" className="underline">follows</Link>) to join the global leaderboard — picks
          made in this browser merge into your account, and only picks stamped before a game locks can score.
        </p>
        <p>
          Results and grading come from the daily predictions ledger — the model never re-picks, and neither can you. Full
          methodology on the <Link href="/predictions" className="underline">prediction hubs</Link>.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function SlateTab({
  league,
  entries,
  now,
  pickFor,
  seasonOf,
  upsertPick,
  removePick,
}: {
  league: PicksLeague;
  entries: LedgerEntry[];
  now: number;
  pickFor: (lg: PicksLeague, e: LedgerEntry) => StoredPick | undefined;
  seasonOf: (lg: PicksLeague) => string;
  upsertPick: (p: StoredPick) => void;
  removePick: (p: StoredPick) => void;
}) {
  const ways = LEAGUE_META[league].ways;
  const picked = entries.filter((e) => pickFor(league, e));
  const agree = picked.filter((e) => pickFor(league, e)!.pick === e.pick);

  if (!entries.length) {
    return <div className="rounded-xl border border-dashed p-6 text-sm text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>Loading the slate…</div>;
  }

  let lastDate = "";
  return (
    <>
      <div className="flex gap-4 flex-wrap items-center text-[13px] text-[var(--text-muted)] mb-3">
        <span>Picked <b className="text-[var(--text)]">{picked.length}</b>/{entries.length}</span>
        <span>Agreeing with the model: <b className="text-[var(--text)]">{picked.length ? `${agree.length}/${picked.length}` : "–"}</b></span>
      </div>
      {entries.map((e) => {
        const head = e.date !== lastDate ? fmtDate(e.date) : null;
        lastDate = e.date;
        const my = pickFor(league, e);
        const locked = isLocked(e, now);
        const graded = e.result != null;
        const won = graded && my && my.pick === e.result;
        const opts: [PickCode, string][] =
          ways === 3 ? [["H", e.home], ["D", "Draw"], ["A", e.away]] : [["A", e.away], ["H", e.home]];
        return (
          <div key={eventKey(league, e)}>
            {head && <div className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mt-5 mb-2">{head}</div>}
            <div
              className="rounded-xl border p-4 mb-2"
              style={{ ...CARD, borderColor: graded && my ? (won ? "#10b981" : "#E2628B") : "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold text-[14.5px] min-w-0">
                  {league === "nfl" ? (
                    <>{e.away} <span className="font-normal text-[12.5px] text-[var(--text-dim)]">at</span> {e.home}</>
                  ) : (
                    <>{e.home} <span className="font-normal text-[12.5px] text-[var(--text-dim)]">v</span> {e.away}</>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-dim)]">{locked ? (graded ? `FT ${e.score ?? ""}` : "\u{1F512} Locked") : "Open"}</div>
              </div>

              {!locked && (
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  {opts.map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        const base: StoredPick = {
                          league,
                          season: seasonOf(league),
                          event_key: eventKey(league, e),
                          mode: "slate",
                          pick: code,
                          confidence: my?.confidence ?? null,
                          picked_at: new Date().toISOString(),
                        };
                        if (my?.pick === code) removePick(base);
                        else upsertPick(base);
                      }}
                      className={`flex-1 min-w-[72px] rounded-lg border px-2 py-2 text-[13px] text-center transition-colors ${my?.pick === code ? "font-bold" : "hover:border-[var(--accent-dim)]"}`}
                      style={my?.pick === code ? { background: "var(--accent)", color: "#08080D", borderColor: "var(--accent)" } : { background: "var(--bg)", borderColor: "var(--border)" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {(my || locked) && (
                <div className="mt-2.5 pt-2 border-t border-dashed text-[12.5px]" style={{ borderColor: "var(--border)" }}>
                  <ProbBar league={league} e={e} />
                  <div className="mt-1.5">
                    Model&rsquo;s call: <b>{modelPickLabel(league, e)}</b>
                    {my && (
                      my.pick === e.pick
                        ? <span className="text-[#10b981]"> — you agree</span>
                        : <span className="text-[var(--text-muted)]"> — you&rsquo;re fading the model{my.pick !== "H" && my.pick !== "A" ? " with the draw" : ""}</span>
                    )}
                  </div>
                  {graded && (
                    <div className="mt-1">
                      {resultLabel(e)}{e.result !== "D" && e.result !== "T" ? " win" : ""}.
                      {my && (won
                        ? <b className="text-[#10b981]"> +{SLATE_POINTS}{my.confidence ? ` (+${my.confidence} confidence)` : ""} ✓</b>
                        : <b className="text-[#E2628B]"> 0 ✗</b>)}
                      {" · model "}{e.pick === e.result ? <span className="text-[#10b981]">✓</span> : <span className="text-[#E2628B]">✗</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function ProbBar({ league, e }: { league: PicksLeague; e: LedgerEntry }) {
  if (league === "pl") {
    const { pH, pD = 0, pA = 0 } = e.model;
    return (
      <>
        <div className="flex h-2 rounded overflow-hidden" style={{ background: "var(--bg)" }}>
          <i style={{ width: `${pH * 100}%`, background: "var(--accent)" }} />
          <i style={{ width: `${pD * 100}%`, background: "var(--text-dim)" }} />
          <i style={{ width: `${pA * 100}%`, background: "#7a8fd4" }} />
        </div>
        <div className="flex justify-between text-[10.5px] text-[var(--text-muted)] mt-0.5">
          <span>{e.home} {pct(pH)}</span><span>Draw {pct(pD)}</span><span>{e.away} {pct(pA)}</span>
        </div>
      </>
    );
  }
  const pH = e.model.pH;
  return (
    <>
      <div className="flex h-2 rounded overflow-hidden" style={{ background: "var(--bg)" }}>
        <i style={{ width: `${pH * 100}%`, background: "var(--accent)" }} />
        <i style={{ width: `${(1 - pH) * 100}%`, background: "#7a8fd4" }} />
      </div>
      <div className="flex justify-between text-[10.5px] text-[var(--text-muted)] mt-0.5">
        <span>{e.home} {pct(pH)}</span>
        {e.market && <span className="text-[var(--text-dim)]">market {pct(e.market.pH)}</span>}
        <span>{e.away} {pct(1 - pH)}</span>
      </div>
    </>
  );
}

function ConfidenceTab({
  league,
  entries,
  now,
  pickFor,
  setConfidenceOrder,
}: {
  league: PicksLeague;
  entries: LedgerEntry[];
  now: number;
  pickFor: (lg: PicksLeague, e: LedgerEntry) => StoredPick | undefined;
  setConfidenceOrder: (lg: PicksLeague, orderedKeys: string[]) => void;
}) {
  const picked = entries.filter((e) => pickFor(league, e));
  const unlocked = picked.filter((e) => !isLocked(e, now));
  const locked = picked.filter((e) => isLocked(e, now));

  // Display order: stored confidence desc, else model confidence in your pick.
  const ordered = [...unlocked].sort((a, b) => {
    const pa = pickFor(league, a)!, pb = pickFor(league, b)!;
    const ca = pa.confidence ?? -1, cb = pb.confidence ?? -1;
    if (ca !== cb) return cb - ca;
    return pickProb(league, b, pb.pick as PickCode) - pickProb(league, a, pa.pick as PickCode);
  });

  useEffect(() => {
    // Assign slots whenever the picked set changes and slots are missing/stale.
    const keys = ordered.map((e) => eventKey(league, e));
    const needs = ordered.some((e, i) => {
      const c = pickFor(league, e)!.confidence;
      return c == null || c !== keys.length + locked.length - i;
    });
    if (keys.length && needs) setConfidenceOrder(league, keys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked.length, league]);

  if (!picked.length) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-sm text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Make your picks on The Slate first — then come back and rank them by confidence.
      </div>
    );
  }

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= ordered.length) return;
    const keys = ordered.map((e) => eventKey(league, e));
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setConfidenceOrder(league, keys);
  };

  const n = picked.length;
  const maxHaul = (n * (n + 1)) / 2;

  return (
    <>
      <p className="text-[13px] text-[var(--text-muted)] mb-3 max-w-3xl">
        Your surest call sits on top and its slot value pays as a bonus when the pick lands. Slots default to the
        model&rsquo;s confidence in <i>your</i> picks — reordering them to your own read is where the skill lives.
        Max bonus this slate: <b className="text-[var(--text)]">{maxHaul}</b>.
      </p>
      {ordered.map((e, i) => {
        const p = pickFor(league, e)!;
        const graded = e.result != null;
        const won = graded && p.pick === e.result;
        const pickLab = p.pick === "H" ? e.home : p.pick === "A" ? e.away : "Draw";
        return (
          <div
            key={eventKey(league, e)}
            className="flex items-center gap-3 rounded-xl border px-3 py-2.5 mb-1.5"
            style={{ ...CARD, borderColor: graded ? (won ? "#10b981" : "#E2628B") : "var(--border)" }}
          >
            <div className="w-9 text-center text-lg font-extrabold text-[var(--accent)]" style={MONO}>{p.confidence ?? "–"}</div>
            <div className="flex-1 min-w-0 text-[13.5px]">
              <b>{pickLab}</b>{" "}
              <span className="text-[11.5px] text-[var(--text-dim)]">
                ({league === "nfl" ? `${e.away} at ${e.home}` : `${e.home} v ${e.away}`} · model gives your pick {pct(pickProb(league, e, p.pick as PickCode))})
              </span>
              {graded && (
                <div className="text-[11.5px] text-[var(--text-dim)]">
                  {won ? <span className="text-[#10b981]">landed: +{p.confidence}</span> : "missed: 0"}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" aria-label="More confident" onClick={() => move(i, -1)} className="rounded border w-7 h-6 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>▲</button>
              <button type="button" aria-label="Less confident" onClick={() => move(i, 1)} className="rounded border w-7 h-6 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>▼</button>
            </div>
          </div>
        );
      })}
      {locked.map((e) => {
        const p = pickFor(league, e)!;
        const pickLab = p.pick === "H" ? e.home : p.pick === "A" ? e.away : "Draw";
        return (
          <div key={eventKey(league, e)} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 mb-1.5 opacity-70" style={CARD}>
            <div className="w-9 text-center text-lg font-extrabold text-[var(--text-dim)]" style={MONO}>{p.confidence ?? "–"}</div>
            <div className="flex-1 min-w-0 text-[13.5px]"><b>{pickLab}</b> <span className="text-[11.5px] text-[var(--text-dim)]">{"\u{1F512}"} locked</span></div>
          </div>
        );
      })}
    </>
  );
}

function RadarTab({
  nfl,
  now,
  radarPicks,
  seasonOf,
  upsertPick,
  removePick,
}: {
  nfl: LedgerEntry[];
  now: number;
  radarPicks: Map<string, StoredPick>;
  seasonOf: (lg: PicksLeague) => string;
  upsertPick: (p: StoredPick) => void;
  removePick: (p: StoredPick) => void;
}) {
  const games = radarGames(nfl);
  if (!games.length) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-sm text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Upset Radar needs posted market odds — it lights up as soon as the ledger carries them (NFL first;
        Premier League follows when football-data posts matchweek odds).
      </div>
    );
  }
  return (
    <>
      <p className="text-[13px] text-[var(--text-muted)] mb-3 max-w-3xl">
        Only this site can run this game: we publish both our model&rsquo;s probability and the betting market&rsquo;s.
        These are the {games.length} biggest disagreements of the week. Side with a source — when the game grades,
        the one that was closer to the truth (lower Brier) wins, and siding with it pays <b className="text-[var(--text)]">+{RADAR_POINTS}</b>.
      </p>
      {games.map((e) => {
        const key = eventKey("nfl", e);
        const my = radarPicks.get(key);
        const locked = isLocked(e, now);
        const verdict = radarVerdict(e);
        const sides: { side: RadarSide; who: string; p: number }[] = [
          { side: "model", who: "\u{1F916} Our model", p: e.model.pH },
          { side: "market", who: "\u{1F4B0} The market", p: (e.market as { pH: number }).pH },
        ];
        return (
          <div
            key={key}
            className="rounded-xl border p-4 mb-2.5"
            style={{ ...CARD, borderColor: verdict && my ? (my.pick === verdict ? "#10b981" : verdict === "push" ? "var(--border)" : "#E2628B") : "var(--border)" }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold text-[14.5px]">
                {e.away} <span className="font-normal text-[12.5px] text-[var(--text-dim)]">at</span> {e.home}
                <span className="ml-2 align-middle text-[10.5px] rounded-full border px-2 py-0.5 text-[#E3C86B]" style={{ borderColor: "#E3C86B" }}>
                  Δ {(e.gap * 100).toFixed(1)} pts
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-dim)]">{fmtDate(e.date)}{locked && !verdict ? " · \u{1F512}" : ""}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5">
              {sides.map(({ side, who, p }) => (
                <button
                  key={side}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    const base: StoredPick = {
                      league: "nfl",
                      season: seasonOf("nfl"),
                      event_key: key,
                      mode: "radar",
                      pick: side,
                      confidence: null,
                      picked_at: new Date().toISOString(),
                    };
                    if (my?.pick === side) removePick(base);
                    else upsertPick(base);
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-center transition-colors ${my?.pick === side ? "border-[var(--accent)]" : locked ? "opacity-60" : "hover:border-[var(--accent-dim)]"}`}
                  style={{ background: my?.pick === side ? "rgba(78,205,196,.08)" : "var(--bg)", borderColor: my?.pick === side ? undefined : "var(--border)" }}
                >
                  <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-muted)]">{who}</div>
                  <div className="text-[17px] font-extrabold" style={MONO}>{p >= 0.5 ? e.home : e.away} {pct(p >= 0.5 ? p : 1 - p)}</div>
                </button>
              ))}
            </div>
            {verdict && (
              <div className="mt-2 text-[12.5px]">
                FT {e.score}. Closer source: <b>{verdict === "push" ? "dead heat" : verdict === "model" ? "our model" : "the market"}</b>
                {my && verdict !== "push" && (
                  my.pick === verdict
                    ? <span className="text-[#10b981]"> — you sided right, +{RADAR_POINTS}</span>
                    : <span className="text-[#E2628B]"> — wrong side, 0</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function SeasonTab({
  ready,
  user,
  authEnabled,
  signIn,
  signOut,
  grade,
  radarGrade,
  board,
  ledgers,
}: {
  ready: boolean;
  user: PickUser | null;
  authEnabled: boolean;
  signIn: () => void;
  signOut: () => void;
  grade: ReturnType<typeof gradeSlate>;
  radarGrade: { points: number; wins: number; losses: number };
  board: { rows: (StoredPick & { user_id: string })[]; names: Map<string, string> } | null;
  ledgers: Partial<Record<PicksLeague, LedgerFile>>;
}) {
  const totalPts = grade.points + radarGrade.points;
  const modelPts = grade.modelWins * SLATE_POINTS;
  const anyGraded = grade.modelWins + grade.modelLosses > 0;

  const lb = useMemo(() => {
    if (!board) return null;
    return computeLeaderboard(board.rows, board.names, { pl: ledgers.pl?.ledger, nfl: ledgers.nfl?.ledger });
  }, [board, ledgers]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 mb-5 flex-wrap" style={CARD}>
        {!authEnabled ? (
          <div className="text-[13px] text-[var(--text-muted)]">Sign-in is unavailable right now — picks stay in this browser.</div>
        ) : user ? (
          <>
            <div className="flex items-center gap-3 min-w-0">
              {user.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt="" width={28} height={28} className="rounded-full" loading="lazy" decoding="async" />
              )}
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">{user.name}</div>
                <div className="text-[11px] text-[var(--text-muted)]">Picks synced to your account and counted on the leaderboard</div>
              </div>
            </div>
            <button type="button" onClick={signOut} className="shrink-0 text-[12px] rounded-full border px-3 py-1.5 hover:border-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)" }}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <div className="text-[13px] text-[var(--text-muted)]">
              {ready ? "Signed out — picks live only in this browser. Sign in before games lock to count on the leaderboard." : " "}
            </div>
            <button
              type="button"
              onClick={signIn}
              className="shrink-0 inline-flex items-center gap-2 rounded-full font-medium text-[13px] px-4 py-2 transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "#08080D" }}
            >
              <span aria-hidden>G</span> Sign in with Google
            </button>
          </>
        )}
      </div>

      <div className="grid gap-2 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
        <Stat v={anyGraded ? String(totalPts) : "–"} k="Points" />
        <Stat v={`${grade.wins + radarGrade.wins}–${grade.losses + radarGrade.losses}`} k="Record" />
        <Stat v={grade.bestStreak ? `${grade.bestStreak} \u{1F525}` : "–"} k="Best streak" />
        <Stat
          v={anyGraded ? `${grade.wins > grade.modelWins ? "W" : grade.wins < grade.modelWins ? "L" : "T"} (${grade.wins}–${grade.modelWins})` : "–"}
          k="vs the Model"
        />
      </div>

      <h2 className="text-xl font-bold mb-1">Leaderboard</h2>
      <p className="text-[12.5px] text-[var(--text-muted)] mb-3">
        Global board, graded from everyone&rsquo;s pre-lock picks. The Model plays as the house entry — there is always
        someone to beat.
      </p>
      {!authEnabled || !lb ? (
        <div className="rounded-xl border border-dashed p-5 text-sm text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
          {authEnabled ? "Loading the board…" : "Leaderboard unavailable without sign-in service."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]" data-sticky-col="2">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>#</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Player</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Pts</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Record</th>
                <th className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>Streak</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows: { name: string; pts: number; rec: string; streak: number; me?: boolean; house?: boolean }[] = lb.map((r) => ({
                  name: r.name,
                  pts: r.points,
                  rec: `${r.wins}–${r.losses}`,
                  streak: r.bestStreak,
                  me: !!user && r.userId === user.id,
                }));
                rows.push({ name: "\u{1F916} The Model (house)", pts: modelPts, rec: `${grade.modelWins}–${grade.modelLosses}`, streak: 0, house: true });
                rows.sort((a, b) => b.pts - a.pts);
                return rows.map((r, i) => (
                  <tr key={`${r.name}${i}`} style={r.me ? { background: "rgba(78,205,196,.06)" } : undefined}>
                    <td className="py-2 px-2 border-b" style={{ borderColor: "var(--border)", ...MONO }}>{i + 1}</td>
                    <td className={`py-2 px-2 border-b ${r.house ? "italic text-[var(--text-muted)]" : ""}`} style={{ borderColor: "var(--border)" }}>{r.name}{r.me ? " (you)" : ""}</td>
                    <td className="py-2 px-2 border-b font-bold" style={{ borderColor: "var(--border)", ...MONO }}>{r.pts}</td>
                    <td className="py-2 px-2 border-b" style={{ borderColor: "var(--border)", ...MONO }}>{r.rec}</td>
                    <td className="py-2 px-2 border-b" style={{ borderColor: "var(--border)" }}>{r.streak ? `${r.streak} \u{1F525}` : "–"}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5" style={CARD}>
      <div className="text-[20px] font-extrabold" style={MONO}>{v}</div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-muted)]">{k}</div>
    </div>
  );
}

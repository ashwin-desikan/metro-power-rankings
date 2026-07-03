import { getAllMetros } from '@/lib/data';
import { getSubstackPosts, type SubstackPost } from '@/lib/substack';
import { getLiveBadges } from '@/lib/badges';
import { leagueStatusFor, type LeagueStatusTone } from '@/lib/leagueStatus';
import { FEATURED } from '@/app/sports/games/featured';
import { flagCdnUrl } from '@/lib/international-display';
import { datasetJsonLd, serializeJsonLd } from '@/lib/seo';
import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';

// Directory-forward landing page. Surfaces the breadth of the site first —
// four ranked indices (each with a live top-three preview), a Greatest Games
// showcase, the full atlas, live sports, the journal, badges, and a site
// index — and routes the metro rankings table to its own /rankings hub.
// Server component; the only async work is the hourly Substack ISR fetch.
export const revalidate = 3600;

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
}

function readData<T>(rel: string[], fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'data', ...rel), 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function getLastUpdate(): string {
  const meta = readData<{ lastUpdate?: string }>(['meta.json'], {});
  return meta.lastUpdate || new Date().toISOString().slice(0, 10);
}

// Football nation names (incl. historical) -> internal nation slug, used with
// the site-wide flagCdnUrl helper to render real flag images (emoji flags do
// not render on Windows browsers, so we use images everywhere).
const FB_SLUG: Record<string, string> = {
  'West Germany': 'germany', 'East Germany': 'germany', 'Germany': 'germany', 'Hungary': 'hungary',
  'England': 'england', 'Scotland': 'scotland', 'Wales': 'wales', 'Argentina': 'argentina', 'France': 'france',
  'Brazil': 'brazil', 'Italy': 'italy', 'Spain': 'spain', 'Netherlands': 'netherlands', 'Uruguay': 'uruguay',
  'Portugal': 'portugal', 'Croatia': 'croatia', 'Morocco': 'morocco', 'Mexico': 'mexico', 'USA': 'united-states', 'United States': 'united-states',
};
function footballFlagUrls(matchup?: string): string[] {
  if (!matchup) return [];
  const m = /^(.+?)\s+\d+\s*[-\u2013]\s*\d+\s+(.+?)$/.exec(matchup);
  if (!m) return [];
  return [m[1].trim(), m[2].trim()]
    .map((nm) => { const sl = FB_SLUG[nm]; return sl ? flagCdnUrl(sl, '20x15') : null; })
    .filter((u): u is string => !!u);
}

// ---- Top-three previews for the index cards ----
type Preview = { name: string; meta: string; sub?: string; flagUrl?: string | null };

function topMetros(): Preview[] {
  return getAllMetros().slice(0, 3).map((m) => ({ name: m.name, sub: m.country, meta: m.score.toFixed(1) }));
}
function topPeople(): Preview[] {
  const d = readData<{ ranking?: { name: string; metro?: string; power?: number }[] }>(['power-ranking.json'], {});
  return (d.ranking ?? []).slice(0, 3).map((p) => ({ name: p.name, sub: p.metro, meta: p.power != null ? String(Math.round(p.power)) : '' }));
}
function topNations(): Preview[] {
  const d = readData<{ nations?: { name: string; merit?: number; continent?: string; countrySlug?: string; slug?: string }[] }>(['zone-zero-cup.json'], {});
  return (d.nations ?? []).slice(0, 3).map((n) => ({
    name: n.name,
    sub: n.continent,
    flagUrl: n.slug ? flagCdnUrl(n.slug, '20x15') : null,
    meta: n.merit != null ? n.merit.toFixed(0) : '',
  }));
}
function topArtists(): Preview[] {
  const d = readData<{ name: string; metro?: string; combined?: number }[]>(['sound', 'artists.json'], []);
  return d.slice(0, 3).map((a) => ({ name: a.name, sub: a.metro, meta: a.combined != null ? a.combined.toFixed(0) : '' }));
}

// ---- Greatest Games: one marquee game per sport (excluding NHL), pulled
// from the same curated FEATURED list that powers /sports/games. ----
const GAME_SPORTS: { tag: string; label: string; emoji: string }[] = [
  { tag: 'INTFB', label: 'World Football', emoji: '⚽' },
  { tag: 'NFL', label: 'NFL', emoji: '🏈' },
  { tag: 'NBA', label: 'NBA', emoji: '🏀' },
  { tag: 'MLB', label: 'MLB', emoji: '⚾' },
  { tag: 'CFB', label: 'College Football', emoji: '🏈' },
  { tag: 'CBB', label: 'College Hoops', emoji: '🏀' },
];
type GameEntry = { title: string; matchup?: string; note?: string; flagUrls: string[]; rank?: number };
type SportGames = { tag: string; label: string; emoji: string; games: GameEntry[] };
// True all-time Game Score rank for each curated clip, matched against the
// same ranked source the /sports/games page uses: by game date for the pro
// leagues, by team pairing for college (its FEATURED clips carry no date).
type RankRow = { date?: string; team?: string; opp?: string };
const RANK_SRC: Record<string, { file: string[]; key?: string; by: 'date' | 'teams' }> = {
  INTFB: { file: ['international', 'top-games-all-time.json'], by: 'date' },
  NFL: { file: ['nfl', 'top-games-all-time.json'], by: 'date' },
  NBA: { file: ['nba', 'top-games-all-time.json'], by: 'date' },
  MLB: { file: ['mlb', 'top-games-all-time.json'], by: 'date' },
  CFB: { file: ['cfb', 'games.json'], key: 'top_overall', by: 'teams' },
  CBB: { file: ['cbb', 'games.json'], key: 'top_overall', by: 'teams' },
};
function norm(x?: string): string { return (x ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function rankByDate(rows: RankRow[], date?: string): number | undefined {
  if (!date) return undefined;
  const i = rows.findIndex((r) => r.date === date);
  return i >= 0 ? i + 1 : undefined;
}
function rankByTeams(rows: RankRow[], matchup?: string): number | undefined {
  if (!matchup) return undefined;
  const parts = matchup.split(/\s+\d+\s*[-\u2013]\s*\d+\s*(?:\([^)]*\)\s*)?/).map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2) return undefined;
  const key = [norm(parts[0]), norm(parts[1])];
  const i = rows.findIndex((r) => { const a = norm(r.team), b = norm(r.opp); return (a === key[0] && b === key[1]) || (a === key[1] && b === key[0]); });
  return i >= 0 ? i + 1 : undefined;
}
function marqueeGames(): SportGames[] {
  const out: SportGames[] = [];
  for (const s of GAME_SPORTS) {
    const feats = FEATURED.filter((f) => f.leagueTag === s.tag).slice(0, 2);
    if (!feats.length) continue;
    const src = RANK_SRC[s.tag];
    const rows: RankRow[] = src.key
      ? (readData<Record<string, RankRow[]>>(src.file, {})[src.key] ?? [])
      : readData<RankRow[]>(src.file, []);
    const games: GameEntry[] = feats.map((g) => ({
      title: g.title,
      matchup: g.matchup,
      note: g.note,
      flagUrls: s.tag === 'INTFB' ? footballFlagUrls(g.matchup) : [],
      rank: src.by === 'date' ? rankByDate(rows, g.match?.date) : rankByTeams(rows, g.matchup),
    }));
    out.push({ tag: s.tag, label: s.label, emoji: s.emoji, games });
  }
  return out;
}

type CricEntry = { date: string; fmt: string; team: string; teamSlug: string; opp: string; oppSlug: string; winner: string; detail?: string; major?: string | null; round?: string | null; city?: string | null };
type RugEntry = { date: string; team: string; teamSlug: string; opp: string; oppSlug: string; winner: string; pf: number; pa: number; draw: boolean; competition: string; stage: string; city?: string | null };

// Cricket and Rugby Union carry their own Game Score boards (public/data/*/top-games.json),
// not the FEATURED clip list, so their top-two marquee cards are built straight from the data.
function ballGames(): SportGames[] {
  const out: SportGames[] = [];
  const cric = readData<{ combined: CricEntry[] }>(['cricket', 'top-games.json'], { combined: [] }).combined.slice(0, 2);
  if (cric.length) {
    out.push({
      tag: 'CRICKET', label: 'Cricket', emoji: '\u{1F3CF}',
      games: cric.map((e, i) => {
        const winner = e.winner || e.team;
        const loser = e.winner ? (e.winner === e.team ? e.opp : e.team) : e.opp;
        const wSlug = e.winner ? (e.winner === e.team ? e.teamSlug : e.oppSlug) : e.teamSlug;
        const lSlug = e.winner ? (e.winner === e.team ? e.oppSlug : e.teamSlug) : e.oppSlug;
        const yr = e.date.slice(0, 4);
        const isAshes = e.fmt === 'Test' && ((e.team === 'England' && e.opp === 'Australia') || (e.team === 'Australia' && e.opp === 'England'));
        const title = e.major ? [yr, e.major, e.round || ''].filter(Boolean).join(' ') : `${yr} ${isAshes ? 'Ashes' : e.fmt}`;
        return {
          title,
          matchup: e.winner ? `${winner} beat ${loser}` : `${e.team} tied ${e.opp}`,
          note: [e.detail, e.city].filter(Boolean).join(' \u00B7 ') || undefined,
          flagUrls: [flagCdnUrl(wSlug, '20x15'), flagCdnUrl(lSlug, '20x15')].filter(Boolean) as string[],
          rank: i + 1,
        };
      }),
    });
  }
  const rug = readData<{ top: RugEntry[] }>(['rugby-union', 'top-games.json'], { top: [] }).top.slice(0, 2);
  if (rug.length) {
    out.push({
      tag: 'RUGBYU', label: 'Rugby Union', emoji: '\u{1F3C9}',
      games: rug.map((e, i) => {
        const winner = e.winner || e.team;
        const loser = e.winner ? (e.winner === e.team ? e.opp : e.team) : e.opp;
        const wSlug = e.winner ? (e.winner === e.team ? e.teamSlug : e.oppSlug) : e.teamSlug;
        const lSlug = e.winner ? (e.winner === e.team ? e.oppSlug : e.teamSlug) : e.oppSlug;
        const wp = e.winner === e.opp ? e.pa : e.pf;
        const lp = e.winner === e.opp ? e.pf : e.pa;
        const title = [e.competition, e.stage && e.stage !== 'Pool' ? e.stage : ''].filter(Boolean).join(' ');
        return {
          title,
          matchup: e.draw ? `${e.team} drew ${e.opp} ${e.pf}-${e.pa}` : `${winner} beat ${loser} ${wp}-${lp}`,
          note: e.city || undefined,
          flagUrls: [flagCdnUrl(wSlug, '20x15'), flagCdnUrl(lSlug, '20x15')].filter(Boolean) as string[],
          rank: i + 1,
        };
      }),
    });
  }
  return out;
}

type IndexCard = { n: string; title: string; desc: string; stat: string; href: string; emoji?: string; seal?: boolean; isNew?: boolean; preview: Preview[] };

type AtlasCard = { emoji: string; title: string; desc: string; href: string; sub: string; live?: boolean };
const ATLAS: AtlasCard[] = [
  { emoji: '🏙️', title: 'Rankings', desc: 'The metro leaderboard, badges, and the compare tool.', href: '/rankings', sub: 'Top 100 · Compare · Badges' },
  { emoji: '🗺️', title: 'Geography', desc: 'Countries, states, and the expandable world map.', href: '/countries', sub: 'Countries · States · Map · Matchups' },
  { emoji: '🏟️', title: 'Sports', desc: 'Every league, national team, and cross-sport index.', href: '/sports', sub: 'Leagues · Zone Zero Cup · Rivalries', live: true },
  { emoji: '🎵', title: 'Sound', desc: 'The music of the metros, by chart and by decade.', href: '/sound', sub: 'Rankings · Artists · Awards · Decades' },
  { emoji: '👑', title: 'People', desc: 'The powerful, the wealthy, and the elected.', href: '/power', sub: 'Nowhere 100 · Billionaires · Mayors' },
  { emoji: '✍️', title: 'Essays', desc: 'Long-form deep dives and the Substack archive.', href: '/deep-dives', sub: 'Deep Dives · Substack' },
  { emoji: '🏅', title: 'Badges', desc: 'The same data reframed through categorical lenses.', href: '/badges', sub: 'Finance · Culture · Rail · Sport' },
  { emoji: '🎮', title: 'Play', desc: 'Games and learning tools for younger fans.', href: '/play', sub: 'Kids Games · Arcade' },
];

// Masthead quick-launch: every Atlas section as a badge tile, plus explicit
// entries for the kids games and the arcade games.
const MASTHEAD_LAUNCH: { emoji: string; label: string; href: string }[] = [
  { emoji: '🏙️', label: 'Rankings', href: '/rankings' },
  { emoji: '🗺️', label: 'Geography', href: '/countries' },
  { emoji: '🏟️', label: 'Sports', href: '/sports' },
  { emoji: '🎵', label: 'Sound', href: '/sound' },
  { emoji: '👑', label: 'People', href: '/power' },
  { emoji: '✍️', label: 'Essays', href: '/deep-dives' },
  { emoji: '🏅', label: 'Badges', href: '/badges' },
  { emoji: '🧸', label: 'Kids Games', href: '/play' },
  { emoji: '🕹️', label: 'Games', href: '/play/arcade' },
];

const LEAGUES: { name: string; href: string; emoji?: string }[] = [
  { name: 'World Cup 2026', href: '/teams/national', emoji: '🏆' },
  { name: 'NBA', href: '/teams/nba', emoji: '🏀' },
  { name: 'NHL', href: '/teams/nhl', emoji: '🏒' },
  { name: 'MLB', href: '/teams/mlb', emoji: '⚾' },
  { name: 'MLS', href: '/teams/football/leagues/mls', emoji: '⚽' },
  { name: 'WNBA', href: '/teams/wnba', emoji: '🏀' },
  { name: "Women's Football", href: '/teams/wfootball', emoji: '⚽' },
  { name: 'CFL', href: '/teams/cfl', emoji: '🏈' },
  { name: 'AFL', href: '/teams/afl', emoji: '🏉' },
  { name: 'NRL', href: '/teams/nrl', emoji: '🏉' },
];

const TONE_COLOR: Record<LeagueStatusTone, string> = {
  regular: '#10b981',
  playoffs: '#f59e0b',
  worldcup: '#a855f7',
  champion: '#d4af37',
  offseason: 'var(--text-dim)',
};

type IndexColumn = { heading: string; links: { label: string; href: string }[] };
const SITE_INDEX: IndexColumn[] = [
  { heading: 'Rankings', links: [
    { label: 'Metro Power Rankings', href: '/rankings' },
    { label: 'The Nowhere 100', href: '/power' },
    { label: 'Zone Zero Cup', href: '/sports/zone-zero-cup' },
    { label: 'Artist Rankings', href: '/sound/artists' },
    { label: 'Compare metros', href: '/compare' },
    { label: 'Badges', href: '/badges' },
  ]},
  { heading: 'Geography', links: [
    { label: 'Countries', href: '/countries' },
    { label: 'States & Provinces', href: '/states' },
    { label: 'Expandable Map', href: '/expandable-map' },
    { label: 'Matchups', href: '/matchups/london-vs-new-york' },
    { label: 'Neighborhoods', href: '/neighborhoods' },
    { label: 'Regional champions', href: '/rankings#regions' },
  ]},
  { heading: 'Sports', links: [
    { label: 'Sports Hub', href: '/sports' },
    { label: 'Zone Zero Cup', href: '/sports/zone-zero-cup' },
    { label: 'The Greatest Games', href: '/sports/games' },
    { label: 'Geography of Erasure', href: '/sports/geography-of-erasure' },
    { label: 'Team Valuations', href: '/sports/valuations' },
    { label: 'Rivalries', href: '/sports/rivalries' },
  ]},
  { heading: 'Sound & People', links: [
    { label: 'The Sound of the Metros', href: '/sound' },
    { label: 'Rankings by Metro', href: '/sound/rankings' },
    { label: 'Artists', href: '/sound/artists' },
    { label: 'Awards History', href: '/sound/grammys' },
    { label: 'Billionaires', href: '/billionaires' },
    { label: 'Mayors of the World', href: '/mayors' },
  ]},
  { heading: 'More', links: [
    { label: 'About', href: '/about' },
    { label: 'Methodology', href: '/methodology' },
    { label: 'Deep Dives', href: '/deep-dives' },
    { label: 'Play', href: '/play' },
    { label: 'Updates', href: '/updates' },
    { label: 'Studio', href: '/studio' },
    { label: 'Random metro', href: '/random' },
  ]},
];

const DIMENSIONS = [
  'Population', 'Market Capitalization', 'Major League Teams & Venues', 'Minor & College Teams',
  'Cultural & Civic Assets', 'Top-50 Universities', 'Other Research Institutions', 'Metro Transit',
  'GaWC Global Connectivity', 'Suburban Rail', 'Intercity Train Hubs', 'Skyscrapers',
  'Airport Score', 'Major Sporting Events', 'Annual Cultural Events', 'Michelin & Luxury Hospitality',
];

function IndexPreview({ rows }: { rows: Preview[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 mb-3 flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="text-[11px] flex-shrink-0" style={{ ...MONO, color: 'var(--text-dim)' }}>{i + 1}</span>
            {r.flagUrl && <img src={r.flagUrl} alt="" width={18} height={13} className="flex-shrink-0 rounded-[2px]" style={{ objectFit: 'cover' }} />}
            <span className="text-[13px] font-medium truncate">{r.name}</span>
            {r.sub && <span className="text-[11px] text-[var(--text-dim)] truncate hidden sm:inline">{r.sub}</span>}
          </span>
          {r.meta && <span className="text-[11px] flex-shrink-0" style={{ ...MONO, color: 'var(--accent)' }}>{r.meta}</span>}
        </div>
      ))}
    </div>
  );
}

export default async function Home() {
  const metros = getAllMetros();
  const lastUpdate = getLastUpdate();
  const posts: SubstackPost[] = await getSubstackPosts();
  const journal = posts.slice(0, 3);
  const badges = getLiveBadges();
  const games = [...marqueeGames(), ...ballGames()];

  const INDICES: IndexCard[] = [
    { n: '01', title: 'Metro Power Rankings', desc: 'Every metro on Earth, scored across sixteen weighted dimensions.', stat: '4,200+ metros', href: '/rankings', emoji: '🌐', preview: topMetros() },
    { n: '02', title: 'The Nowhere 100', desc: 'The hundred most powerful people alive, on one Metro Power scale.', stat: '100 people', href: '/power', seal: true, preview: topPeople() },
    { n: '03', title: 'Zone Zero Cup', desc: 'National sporting merit across fourteen pillars, ten-year half-life.', stat: '200+ nations', href: '/sports/zone-zero-cup', emoji: '🏆', preview: topNations() },
    { n: '04', title: 'Musical Artist Rankings', desc: 'The biggest artists by chart success and prestige, by home metro.', stat: 'By metro', href: '/sound/artists', emoji: '🎵', isNew: true, preview: topArtists() },
  ];

  const leagueRows = LEAGUES.map((l) => ({ ...l, status: leagueStatusFor(l.href) }));
  const liveLeagues = leagueRows.filter((l) => l.status && l.status.tone !== 'offseason');

  const dataset = datasetJsonLd({ lastUpdate, metroCount: metros.length });

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(dataset) }} />

      {/* Masthead — headline + live standings/badges + This Week rail. */}
      <section className="pt-16 pb-14 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto grid gap-10 lg:gap-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <div>
            <p className="text-xs uppercase tracking-widest mb-3" style={{ ...MONO, color: 'var(--accent)' }}>
              rankings.citizenofnowhere.org
            </p>
            <h1 className="font-extrabold leading-tight mb-4" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
              Cities are the unit of civilization.
            </h1>
            <p className="text-base text-[var(--text)] max-w-lg mb-3">
              So we measure them, and the power, sport, and culture they concentrate.
            </p>
            <p className="text-[15px] text-[var(--text-muted)] max-w-lg mb-6">
              Everything ranked in the open, for anyone who would rather settle an argument with data
              than opinion.
            </p>

          </div>

          {/* Explore launcher — quick visual entry to every section + the games. */}
          <div className="h-fit">
            <p className="text-[11px] uppercase tracking-widest mb-3" style={{ ...MONO, color: 'var(--text-muted)' }}>Explore the site</p>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {MASTHEAD_LAUNCH.map((t) => (
                <Link key={t.href + t.label} href={t.href} className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <span className="text-lg leading-none" aria-hidden>{t.emoji}</span>
                  <span className="text-[13px] font-medium">{t.label}</span>
                </Link>
              ))}
            </div>
            <Link href="/random" className="inline-flex items-center gap-1.5 mt-3 text-[13px]" style={{ ...MONO, color: 'var(--accent)' }}>
              🎲 Random metro <span aria-hidden>→</span>
            </Link>
            {/* Live now — standings + sport badges (moved here) + live music charts. */}
            <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
            {liveLeagues.length > 0 && (
              <div>
                <Link href="/sports/standings" className="inline-flex items-center gap-1 text-xs mb-2 hover:opacity-80 transition-opacity" style={{ ...MONO, color: 'var(--accent)' }}>
                  📊 Live standings <span aria-hidden>→</span>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  {liveLeagues.map((l) => {
                    const isWC = l.href === '/teams/national';
                    const color = l.status ? TONE_COLOR[l.status.tone] : 'var(--text-dim)';
                    return (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="inline-flex items-center gap-1.5 rounded-full transition-colors"
                        style={
                          isWC
                            ? { ...MONO, fontSize: 12, padding: '5px 12px', color: '#F5F4EE', background: 'rgba(168,85,247,0.22)', border: '1px solid #a855f7', fontWeight: 600 }
                            : { ...MONO, fontSize: 12, padding: '4px 11px', color: 'var(--text)', background: 'var(--bg-card)', border: '1px solid var(--border)' }
                        }
                        title={l.status ? `${l.name} — ${l.status.label}` : l.name}
                      >
                        <span aria-hidden>{l.emoji}</span>
                        <span>{isWC ? 'World Cup' : l.name}</span>
                        {isWC ? (
                          <span style={{ color: '#c9a4f5' }}>· Final Jul 19</span>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} aria-hidden />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
              <Link href="/sound/charts" className="inline-flex items-center gap-1.5 mt-4 text-[13px]" style={{ ...MONO, color: 'var(--accent)' }}>
                🎵 Live Music Charts <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The Indices — each card previews its live top three, then a Greatest Games showcase. */}
      <section id="indices" className="py-16 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto">
          <p className="text-[11px] uppercase tracking-widest mb-2" style={{ ...MONO, color: 'var(--accent)' }}>The indices</p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">The rankings</h2>
          <p className="text-[15px] text-[var(--text-muted)] max-w-3xl mb-8">
            Metros, people, countries, and artists. Each index has its own hub, hand-curated, weighted in the open, and inspectable at the row level.
          </p>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {INDICES.map((c) => (
              <Link key={c.n} href={c.href} className="flex flex-col p-6 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: 'var(--text-muted)' }}>Index / {c.n}</span>
                  {c.isNew && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ ...MONO, color: 'var(--accent)', background: 'rgba(78,205,196,0.16)' }}>NEW</span>}
                </div>
                <div className="flex items-center gap-2.5 mb-2">
                  {c.seal ? (
                    <img src="/nowhere-100-seal.svg" alt="" width={26} height={26} style={{ flexShrink: 0 }} />
                  ) : (
                    <span className="text-2xl leading-none" aria-hidden>{c.emoji}</span>
                  )}
                  <h3 className="text-lg font-bold">{c.title}</h3>
                </div>
                <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{c.desc}</p>
                <IndexPreview rows={c.preview} />
                <div className="flex items-center justify-between mt-auto pt-3.5 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ ...MONO, color: 'var(--accent)' }}>{c.stat}</span>
                  <span className="text-[var(--text-dim)]" aria-hidden>See all →</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Greatest Games — the top two games in every sport (NHL excluded for now). */}
          {games.length > 0 && (
            <div className="mt-10 pt-8 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-baseline justify-between gap-4 mb-5 flex-wrap">
                <div><h3 className="text-lg font-bold flex items-center gap-2"><span aria-hidden>🎬</span> The Greatest Games</h3><p className="text-[11px] mt-1" style={{ ...MONO, color: 'var(--text-dim)' }}>Two per sport, with all-time Game Score rank</p></div>
                <Link href="/sports/games" className="text-xs" style={{ ...MONO, color: 'var(--accent)' }}>The top games in every sport →</Link>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {games.map((sp) => (
                  <div key={sp.tag} className="p-4 rounded-lg border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-1.5 mb-3 text-[10px] uppercase tracking-widest" style={{ ...MONO, color: 'var(--text-muted)' }}>
                      <span aria-hidden className="text-base leading-none">{sp.emoji}</span>{sp.label}
                    </div>
                    <div className="flex flex-col gap-3">
                      {sp.games.map((g, idx) => (
                        <Link key={idx} href="/sports/games" className="block group">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[11px] flex-shrink-0 font-semibold" style={{ ...MONO, color: 'var(--accent)' }}>{g.rank ? `#${g.rank}` : `#${idx + 1}`}</span>
                            <span className="text-sm font-semibold leading-snug group-hover:text-[var(--accent)] transition-colors">{g.title}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 pl-5">
                            {g.flagUrls.map((u, i) => (
                              <img key={i} src={u} alt="" width={18} height={13} className="rounded-[2px] flex-shrink-0" style={{ objectFit: 'cover' }} />
                            ))}
                            {g.matchup && <span className="text-[12px]" style={{ color: 'var(--accent)' }}>{g.matchup}</span>}
                          </div>
                          {g.note && <span className="block text-[11px] text-[var(--text-dim)] leading-snug pl-5 mt-0.5">{g.note}</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* The Atlas */}
      <section id="atlas" className="py-16 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-baseline justify-between gap-4 mb-8 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-widest mb-2" style={{ ...MONO, color: 'var(--accent)' }}>The atlas</p>
              <h2 className="text-2xl sm:text-3xl font-bold">Everything on the site</h2>
            </div>
            <a href="#index" className="text-xs" style={{ ...MONO, color: 'var(--text-muted)' }}>Full site index →</a>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {ATLAS.map((c) => (
              <Link key={c.title} href={c.href} className="flex flex-col gap-2.5 p-5 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl leading-none" aria-hidden>{c.emoji}</span>
                  <h3 className="text-lg font-bold">{c.title}</h3>
                  {c.live && (
                    <span className="flex items-center gap-1 ml-auto">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} aria-hidden />
                      <span className="text-[10px]" style={{ ...MONO, color: '#10b981' }}>LIVE</span>
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{c.desc}</p>
                <span className="text-xs mt-1" style={{ ...MONO, color: 'var(--text-dim)' }}>{c.sub}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Live / Journal / Badges band */}
      <section id="live" className="py-16 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto grid gap-10" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {/* In season now */}
          <div>
            <p className="text-[11px] uppercase tracking-widest mb-4" style={{ ...MONO, color: 'var(--accent)' }}>🟢 In season now</p>
            <div>
              {leagueRows.map((l) => (
                <a key={l.href} href={l.href} className="flex items-center justify-between gap-3 py-2.5 border-b hover:text-[var(--accent)] transition-colors group" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-[13px] flex items-center gap-2"><span aria-hidden>{l.emoji}</span>{l.name}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.status ? TONE_COLOR[l.status.tone] : 'var(--text-dim)' }} aria-hidden />
                    <span className="text-[10px] uppercase tracking-wide text-right" style={{ ...MONO, color: 'var(--text-muted)' }}>{l.status ? l.status.label.replace('Live - ', '') : 'Offseason'}</span>
                  </span>
                </a>
              ))}
            </div>
            <a href="/sports" className="inline-block mt-3 text-xs" style={{ ...MONO, color: 'var(--text-muted)' }}>Zone Zero Sports Hub →</a>
          </div>

          {/* From the journal */}
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <p className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: 'var(--accent)' }}>✍️ From the journal</p>
              <a href="https://citizenofnowhere.substack.com" target="_blank" rel="noopener noreferrer" className="text-[11px]" style={{ ...MONO, color: 'var(--text-muted)' }}>All essays ↗</a>
            </div>
            <div>
              {journal.map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="block py-3.5 border-b hover:bg-[var(--bg-card-hover)] -mx-2 px-2 rounded transition-colors group" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[11px]" style={{ ...MONO, color: 'var(--text-muted)' }}>{fmtDate(p.pubDate)} · Substack</div>
                  <div className="text-base font-semibold mt-0.5 group-hover:text-[var(--accent)] transition-colors">{p.title}<span className="text-[var(--text-dim)] ml-1" aria-hidden>↗</span></div>
                  {p.description && <div className="text-[13px] text-[var(--text-muted)] mt-1 line-clamp-2">{p.description}</div>}
                </a>
              ))}
            </div>
          </div>

          {/* Badges */}
          <div>
            <p className="text-[11px] uppercase tracking-widest mb-4" style={{ ...MONO, color: 'var(--accent)' }}>🏅 Badges</p>
            <p className="text-[13px] text-[var(--text-muted)] mb-4">The same data, reframed through categorical lenses.</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {badges.map((b) => (
                <Link key={b.slug} href={`/badges/${b.slug}`} className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors hover:brightness-125" style={{ ...MONO, color: 'var(--text)', background: 'rgba(78,205,196,0.16)' }}>
                  <span aria-hidden>{b.emoji}</span>
                  <span>{b.name}</span>
                </Link>
              ))}
            </div>
            <div className="rounded-lg border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <p className="text-[13px] text-[var(--text-muted)] mb-2">Not sure where to start?</p>
              <Link href="/random" className="text-[13px]" style={{ ...MONO, color: 'var(--accent)' }}>🎲 Random metro →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Site Index */}
      <section id="index" className="py-16 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto">
          <p className="text-[11px] uppercase tracking-widest mb-8" style={{ ...MONO, color: 'var(--accent)' }}>Site index</p>
          <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {SITE_INDEX.map((col) => (
              <div key={col.heading}>
                <div className="text-[11px] uppercase tracking-widest pb-2 mb-3 border-b" style={{ ...MONO, color: 'var(--text-muted)', borderColor: 'var(--border)' }}>{col.heading}</div>
                <div className="flex flex-col gap-[7px]">
                  {col.links.map((l) => (
                    <Link key={l.href} href={l.href} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">{l.label}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Methodology teaser */}
      <section id="methodology" className="py-16 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <div>
            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ ...MONO, color: 'var(--accent)' }}>Methodology</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">How the score is built</h2>
            <p className="text-base text-[var(--text-muted)] mb-4">
              The composite measures metro completeness: the breadth and depth of globally-recognized
              infrastructure, culture, sport, finance, education, and connectivity concentrated in one place.
              It is not a livability score or a popularity contest. It is a composite of what a metro has built.
            </p>
            <p className="text-base text-[var(--text-muted)] mb-6">
              Sixteen weighted terms, each drawing its own lines: linear where volume matters, logarithmic
              where returns diminish, capped where you either have the thing or you do not.
            </p>
            <Link href="/methodology" className="inline-block rounded-lg font-semibold text-sm px-5 py-2.5 transition-opacity hover:opacity-90" style={{ backgroundColor: 'var(--accent)', color: '#08080D' }}>
              Read the full methodology
            </Link>
          </div>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {DIMENSIONS.map((d, i) => (
              <div key={d} className="flex items-baseline gap-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs w-6 flex-shrink-0" style={{ ...MONO, color: 'var(--text-dim)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span className="text-sm text-[var(--text)]">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-[13px] text-[var(--text-muted)]">© 2026 Global Metro Power Rankings. Hand-curated by Ashwin Desikan.</p>
          <div className="flex items-center gap-5 text-[13px]" style={MONO}>
            <a href="https://citizenofnowhere.org" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Citizen of Nowhere</a>
            <a href="https://citizenofnowhere.substack.com" target="_blank" rel="noopener noreferrer" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Substack ↗</a>
            <a href="https://citizenofnowhere.substack.com/about" target="_blank" rel="noopener noreferrer" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

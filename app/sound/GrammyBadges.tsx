export interface GrammyAward { year: number; award: string; work?: string | null }

const ABBR: Record<string, string> = {
  'Album of the Year': 'Album of the Year',
  'Record of the Year': 'Record of the Year',
  'Song of the Year': 'Song of the Year',
  'Best New Artist': 'Best New Artist',
};
const GOLD = { background: 'rgba(212,175,55,0.12)', color: '#e8c766', border: '1px solid rgba(212,175,55,0.38)' } as const;
const SILVER = { background: 'rgba(191,196,209,0.10)', color: '#c7ccd6', border: '1px solid rgba(191,196,209,0.32)' } as const;

function Pill({ a, won }: { a: GrammyAward; won: boolean }) {
  return (
    <span
      title={`${won ? 'Won' : 'Nominated'} · ${a.award} ${a.year}${a.work ? `: ${a.work}` : ''}`}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={won ? GOLD : SILVER}
    >
      <span aria-hidden>{won ? '★' : '☆'}</span>{ABBR[a.award] ?? a.award} {a.year}
    </span>
  );
}

/** Gold pills for Big Four wins, silver pills for nominations. */
export function GrammyBadges({ awards, noms, className = '' }: { awards?: GrammyAward[]; noms?: GrammyAward[]; className?: string }) {
  const wins = awards ?? [];
  const nominations = noms ?? [];
  if (wins.length === 0 && nominations.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {wins.map((a, i) => <Pill key={`w${i}`} a={a} won />)}
      {nominations.map((a, i) => <Pill key={`n${i}`} a={a} won={false} />)}
    </div>
  );
}

/** Compact inline marker for dense tables: ★N wins (gold) or ☆N nominations (muted). */
export function GrammyChip({ wins = 0, noms = 0 }: { wins?: number; noms?: number }) {
  if (!wins && !noms) return null;
  return (
    <span
      title={`${wins} Big Four win${wins === 1 ? '' : 's'} · ${noms} nomination${noms === 1 ? '' : 's'}`}
      className="ml-1.5 inline-flex items-center align-middle text-xs font-semibold"
      style={{ color: wins ? '#e8c766' : 'var(--text-muted)' }}
    >
      {wins ? `★${wins}` : `☆${noms}`}
    </span>
  );
}

export interface OtherAward { award: string; year: number; category: string; work?: string | null }
const COPPER = { background: 'rgba(196,132,74,0.10)', color: '#d69f6e', border: '1px solid rgba(196,132,74,0.34)' } as const;

/** Copper pills for wins at other award bodies (BRIT, AMA, VMA, EMA, ARIA, Juno). */
export function AwardBadges({ awards, className = '' }: { awards?: OtherAward[]; className?: string }) {
  if (!awards || awards.length === 0) return null;
  const short = (c: string) => c.replace(/ of the Year$/, '').replace(/ Solo Artist$/, '');
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {awards.map((a, i) => (
        <span
          key={i}
          title={`${a.award}: ${a.category} ${a.year}${a.work ? `: ${a.work}` : ''}`}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={COPPER}
        >
          {a.award} · {short(a.category)} {a.year}
        </span>
      ))}
    </div>
  );
}

export interface RSAlbum { rank: number; album: string }
const CRIMSON = { background: 'rgba(214,90,90,0.10)', color: '#e08a8a', border: '1px solid rgba(214,90,90,0.34)' } as const;

/** Crimson pills for Rolling Stone 500 Greatest Albums placements. */
export function RSBadges({ albums, className = '' }: { albums?: RSAlbum[]; className?: string }) {
  if (!albums || albums.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {albums.map((a, i) => (
        <span
          key={i}
          title={`Rolling Stone 500 Greatest Albums, #${a.rank}: ${a.album}`}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={CRIMSON}
        >
          RS500 #{a.rank} · {a.album}
        </span>
      ))}
    </div>
  );
}

type Tone = 'gold' | 'silver' | 'copper';
const TONE_STYLE = { gold: GOLD, silver: SILVER, copper: COPPER } as const;
const shortCat = (c: string) => c.replace(/ of the Year$/, '').replace(/ Solo Artist$/, '');
interface MergedBadge { year: number; typ: number; tone: Tone; glyph: string; label: string; title: string }

/** All award badges in one row, ordered by YEAR (newest first) then by TYPE within a year (win, nomination, other award). */
export function BadgeRow({ wins = [], noms = [], others = [], className = '' }: { wins?: GrammyAward[]; noms?: GrammyAward[]; others?: OtherAward[]; className?: string }) {
  const items: MergedBadge[] = [];
  for (const a of wins) items.push({ year: a.year, typ: 0, tone: 'gold', glyph: '★', label: `${ABBR[a.award] ?? a.award} ${a.year}`, title: `Won · ${a.award} ${a.year}${a.work ? `: ${a.work}` : ''}` });
  for (const a of noms) items.push({ year: a.year, typ: 1, tone: 'silver', glyph: '☆', label: `${ABBR[a.award] ?? a.award} ${a.year}`, title: `Nominated · ${a.award} ${a.year}${a.work ? `: ${a.work}` : ''}` });
  for (const a of others) items.push({ year: a.year, typ: 2, tone: 'copper', glyph: '', label: `${a.award} · ${shortCat(a.category)} ${a.year}`, title: `${a.award}: ${a.category} ${a.year}${a.work ? `: ${a.work}` : ''}` });
  if (items.length === 0) return null;
  items.sort((x, y) => y.year - x.year || x.typ - y.typ || x.label.localeCompare(y.label));
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((it, i) => (
        <span key={i} title={it.title} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={TONE_STYLE[it.tone]}>
          {it.glyph ? <span aria-hidden>{it.glyph}</span> : null}{it.label}
        </span>
      ))}
    </div>
  );
}

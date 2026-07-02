export interface GrammyAward { year: number; award: string; work?: string | null }

const ABBR: Record<string, string> = {
  'Album of the Year': 'Album of the Year',
  'Record of the Year': 'Record of the Year',
  'Song of the Year': 'Song of the Year',
  'Best New Artist': 'Best New Artist',
};

/** Championship-style gold pills, one per Big Four win. */
export function GrammyBadges({ awards, className = '' }: { awards?: GrammyAward[]; className?: string }) {
  if (!awards || awards.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {awards.map((a, i) => (
        <span
          key={i}
          title={a.work ? `${a.award} ${a.year} — ${a.work}` : `${a.award} ${a.year}`}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: 'rgba(212,175,55,0.12)', color: '#e8c766', border: '1px solid rgba(212,175,55,0.38)' }}
        >
          <span aria-hidden>★</span>{ABBR[a.award] ?? a.award} {a.year}
        </span>
      ))}
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

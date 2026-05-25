"use client";

// Reusable year filter for closed-league LeagueMaps. Number input + slider
// extending one step past maxYear (= ALL sentinel) + ◀/▶ step buttons.
// Wire seasonYear ("" = ALL) into the parent and filter franchises by
// founding year accordingly.

type Props = {
  seasonYear: string;
  setSeasonYear: (s: string) => void;
  minYear: number;
  maxYear: number;
  // Optional label override; defaults to "Active in season".
  label?: string;
};

export default function YearFilterBar({
  seasonYear,
  setSeasonYear,
  minYear,
  maxYear,
  label = "Active in season",
}: Props) {
  const stepBack = () => {
    const cur = seasonYear ? parseInt(seasonYear, 10) : maxYear + 1;
    const next = cur - 1;
    if (next < minYear) setSeasonYear(String(minYear));
    else if (next >= maxYear + 1) setSeasonYear("");
    else setSeasonYear(String(next));
  };
  const stepFwd = () => {
    const cur = seasonYear ? parseInt(seasonYear, 10) : maxYear + 1;
    const next = cur + 1;
    if (next >= maxYear + 1) setSeasonYear("");
    else setSeasonYear(String(next));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      <label className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</label>
      <input
        type="number"
        min={minYear}
        max={maxYear}
        step={1}
        value={seasonYear}
        onChange={(e) => setSeasonYear(e.target.value)}
        placeholder="ALL"
        className="text-sm px-2 py-1 rounded-md border w-24 tabular-nums"
        style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
      />
      <button
        type="button"
        onClick={stepBack}
        disabled={seasonYear !== "" && parseInt(seasonYear, 10) <= minYear}
        aria-label="Previous year"
        className="text-sm px-2 py-1 rounded-md border transition hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
      >◀</button>
      <input
        type="range"
        min={minYear}
        max={maxYear + 1}
        step={1}
        value={seasonYear ? parseInt(seasonYear, 10) : maxYear + 1}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (v >= maxYear + 1) setSeasonYear("");
          else setSeasonYear(String(v));
        }}
        className="flex-1 min-w-[180px] max-w-md accent-[var(--accent)]"
        aria-label="Season year slider (rightmost position = ALL)"
        title="Drag to a year to filter; slide all the way right for ALL eras"
      />
      <button
        type="button"
        onClick={stepFwd}
        disabled={seasonYear === ""}
        aria-label="Next year"
        className="text-sm px-2 py-1 rounded-md border transition hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
      >▶</button>
      {seasonYear !== "" && (
        <button
          onClick={() => setSeasonYear("")}
          className="text-xs px-2.5 py-1 rounded-md border hover:bg-[var(--bg-card-hover)] transition"
          style={{ borderColor: "var(--border)" }}
        >ALL</button>
      )}
      <span className="text-xs text-[var(--text-muted)] tabular-nums">
        {seasonYear ? `${parseInt(seasonYear, 10) - 1}-${String(parseInt(seasonYear, 10)).slice(-2)} season` : "all eras"}
      </span>
    </div>
  );
}

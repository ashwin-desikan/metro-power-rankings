// A single horizontal stacked bar of every move with a known distance,
// binned. Sequential palette (--seq-1..5) because the bins are an ordered
// scale (near to far), not unrelated categories.
export type DistBin = { label: string; count: number };

const SEQ = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)"];

export default function DistanceDistribution({ bins }: { bins: DistBin[] }) {
  const total = bins.reduce((a, b) => a + b.count, 0) || 1;
  return (
    <div>
      <div className="flex h-8 w-full rounded-md overflow-hidden border" style={{ borderColor: "var(--border)" }}>
        {bins.map((b, i) => (
          <div
            key={b.label}
            style={{ width: `${(b.count / total) * 100}%`, backgroundColor: SEQ[i % SEQ.length] }}
            className="h-full"
            title={`${b.label}: ${b.count}`}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5 text-xs">
        {bins.map((b, i) => (
          <div key={b.label} className="flex items-center gap-1.5 min-w-0">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: SEQ[i % SEQ.length] }} />
            <span className="text-[var(--text-muted)] truncate">{b.label}</span>
            <span className="tabular-nums font-semibold text-[var(--text)] flex-shrink-0">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

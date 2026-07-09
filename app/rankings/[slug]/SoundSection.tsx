import Link from "next/link";
import type { MetroSound } from "@/lib/sound";

export default function SoundSection({ sound, slug }: { sound: MetroSound | null; slug: string }) {
  if (!sound) return null;
  return (
    <section>
      <h2 id="sound" className="text-2xl font-bold mb-2 scroll-mt-20">
        Sound of {sound.metro}
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {sound.rank ? `#${sound.rank} by artist origin · ` : ""}
        combined {sound.combined} (US {sound.us} / UK {sound.uk})
        {sound.signatureDecade ? ` · signature decade ${sound.signatureDecade}` : ""} ·{" "}
        <Link href={`/sound/metros/${slug}`} className="underline hover:text-[var(--accent)]">
          Full sound profile &rarr;
        </Link>
      </p>
      {sound.topArtists.length > 0 && (
        <p className="text-sm mb-4">
          <span className="text-[var(--text-muted)]">Top artists: </span>
          {sound.topArtists.map((a) => a.name).join(", ")}
        </p>
      )}
      {sound.numberOnesCount > 0 && (
        <details className="rounded-lg border border-[var(--border)]">
          <summary className="cursor-pointer px-4 py-2 flex items-center justify-between">
            <span className="font-semibold text-[var(--text)]">
              Number-one singles by {sound.metro} artists
            </span>
            <span className="text-sm text-[var(--text-muted)]">{sound.numberOnesCount}</span>
          </summary>
          <div className="border-t border-[var(--border)]">
            {/* Mobile: stacked cards */}
            <div className="sm:hidden divide-y divide-[var(--border)]">
              {sound.numberOnes.map((s, i) => (
                <div key={i} className="px-4 py-2.5">
                  <p className="font-medium text-[var(--text)]">{s.single}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.artist}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--text-muted)]">
                    <span>{s.charts}</span>
                    <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.year}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-card)] text-[var(--text-muted)]">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Single</th>
                    <th className="text-left font-medium px-4 py-2">Artist</th>
                    <th className="text-left font-medium px-4 py-2">Chart</th>
                    <th className="text-right font-medium px-4 py-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Year</th>
                  </tr>
                </thead>
                <tbody>
                  {sound.numberOnes.map((s, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2 font-medium text-[var(--text)]">{s.single}</td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">{s.artist}</td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">{s.charts}</td>
                      <td className="px-4 py-2 text-right text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}

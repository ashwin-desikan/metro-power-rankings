"use client";

import { useState } from "react";
import type { FeaturedGame } from "./featured";

// Lazy YouTube facade: thumbnail + play button until clicked, then a
// privacy-mode (youtube-nocookie) iframe. The rank badge tells the reader
// where this game sits in the league's Game Score list below.
function Facade({
  videoId,
  title,
  rank,
  leagueTag,
}: {
  videoId: string;
  title: string;
  rank?: number;
  leagueTag: string;
}) {
  const [play, setPlay] = useState(false);

  if (play) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: "16 / 9", background: "#000" }}>
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlay(true)}
      aria-label={`Play: ${title}`}
      className="group relative block w-full overflow-hidden rounded-lg"
      style={{ aspectRatio: "16 / 9", background: "#000" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover opacity-85 transition group-hover:opacity-100"
      />
      {typeof rank === "number" ? (
        <span
          className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums shadow"
          style={{ background: "var(--accent)", color: "#06121a" }}
        >
          {leagueTag} #{rank}
        </span>
      ) : null}
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full transition group-hover:scale-110"
          style={{ background: "rgba(0,0,0,0.6)", border: "2px solid rgba(255,255,255,0.85)" }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="white" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  );
}

export default function FeaturedGames({ games }: { games: FeaturedGame[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {games.map((g) => (
        <div
          key={g.videoId ?? g.title}
          className="rounded-xl border p-3"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          {g.videoId ? (
            <Facade videoId={g.videoId} title={g.title} rank={g.rank} leagueTag={g.leagueTag} />
          ) : null}
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div className="font-semibold text-sm tracking-tight">
              {g.title}
              {typeof g.rank === "number" ? (
                <span className="ml-1.5 font-bold" style={{ color: "var(--accent)" }}>#{g.rank}</span>
              ) : null}
            </div>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] whitespace-nowrap">
              {g.leagueTag}
            </span>
          </div>
          {g.matchup ? <div className="text-xs text-[var(--text-muted)] mt-0.5">{g.matchup}</div> : null}
          {g.note ? <div className="text-xs text-[var(--text-dim)] mt-0.5">{g.note}</div> : null}
          <div className="mt-2 flex items-center gap-3 text-[11px]">
            <span className="font-medium" style={{ color: "var(--accent)" }}>{g.clipLabel}</span>
            {g.href ? (
              <a
                href={g.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-muted)] hover:text-[var(--accent)] underline decoration-dotted"
              >
                {g.hrefLabel ?? "Full game"} &#8599;
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

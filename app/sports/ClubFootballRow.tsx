"use client";

import { useState } from "react";
import Link from "next/link";
import { leagueStatusFor, clubFootballStatus, CLUB_FOOTBALL_CHILDREN } from "@/lib/leagueStatus";

// Expandable Club Football row for the /sports console. The parent shows an
// aggregate status (live if any competition or league is in season); expanding
// reveals the competitions and league hubs, each with its own season status.
// Client component because of the open/close toggle.

const TONE_COLOR: Record<string, string> = {
  regular: "#10b981",
  playoffs: "#f59e0b",
  worldcup: "#a855f7",
  offseason: "#55556A",
};

function shortStatus(label: string): string {
  return label.replace(/^Live\s*-\s*/, "");
}

const SECTIONS = ["Competitions", "Leagues"] as const;

export default function ClubFootballRow({
  href,
  label,
  sport,
  dim = false,
}: {
  href: string;
  label: string;
  sport: string;
  dim?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = clubFootballStatus();
  const color = TONE_COLOR[status.tone];

  return (
    <div className="border-t" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-stretch">
        <Link
          href={href}
          className="flex items-center gap-2 pl-2.5 py-1.5 text-[13px] flex-1 min-w-0 transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ color: dim ? "var(--text-muted)" : "var(--text)" }}
        >
          <span
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: 7, height: 7, background: color }}
            aria-hidden="true"
          />
          <span className="flex-1 min-w-0">
            <span className="block truncate leading-tight">{label}</span>
            <span className="block truncate leading-tight text-[10px] text-[var(--text-dim)]">{sport}</span>
          </span>
          <span className="text-[10px] whitespace-nowrap" style={{ color }}>
            {status.label}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Show Club Football competitions and leagues"
          className="px-2.5 flex items-center border-l transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          <span
            className="transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "none", fontSize: "10px" }}
            aria-hidden="true"
          >
            &#9656;
          </span>
        </button>
      </div>

      {open && (
        <div style={{ background: "var(--bg)" }}>
          {SECTIONS.map((sec) => (
            <div key={sec}>
              <div
                className="pl-6 pr-2.5 py-1 text-[9px] tracking-widest uppercase"
                style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
              >
                {sec}
              </div>
              {CLUB_FOOTBALL_CHILDREN.filter((c) => c.section === sec).map((c) => {
                const s = leagueStatusFor(c.href);
                const tone = s?.tone ?? "offseason";
                const dot = TONE_COLOR[tone];
                const live = !!s && tone !== "offseason";
                return (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="flex items-center gap-2 pl-6 pr-2.5 py-1.5 text-[12px] transition-colors hover:bg-[var(--bg-card-hover)]"
                    style={{ color: live ? "var(--text)" : "var(--text-muted)" }}
                  >
                    <span
                      className="inline-block rounded-full flex-shrink-0"
                      style={{ width: 6, height: 6, background: dot }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{c.label}</span>
                    {s && (
                      <span className="text-[10px] whitespace-nowrap" style={{ color: dot }}>
                        {shortStatus(s.label)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

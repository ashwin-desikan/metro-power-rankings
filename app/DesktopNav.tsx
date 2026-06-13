"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { leagueStatusFor, clubFootballStatus, LeagueStatusTag, type LeagueStatus } from "@/lib/leagueStatus";

// Client-side desktop nav. Replaces the pure-CSS hover dropdowns that were
// failing on touch and slow-hover environments. Each dropdown is now a
// proper React state toggle: click opens, click outside closes, escape
// closes. Hover still works on desktop (mouseenter opens; the menu does
// not close on mouseleave because click-to-open users expect it to stay).

type DropdownProps = {
  id: string;
  label: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  children: React.ReactNode;
};

function Dropdown({ id, label, openId, setOpenId, children }: DropdownProps) {
  const isOpen = openId === id;
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click for any dropdown that is open.
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (wrapRef.current?.contains(t)) return;
      setOpenId(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [isOpen, setOpenId]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpenId(isOpen ? null : id)}
        onMouseEnter={() => setOpenId(id)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="text-sm hover:text-[var(--accent)] transition-colors flex items-center gap-1 py-1"
      >
        {label}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div
          className="absolute right-0 top-full pt-2"
          style={{ minWidth: "260px" }}
        >
          <div
            className="border rounded-md shadow-xl backdrop-blur-md overflow-hidden"
            style={{
              backgroundColor: "rgba(8, 8, 13, 0.95)",
              borderColor: "var(--border)",
            }}
            onClick={() => setOpenId(null)}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  href,
  external,
  title,
  hint,
}: {
  href: string;
  external?: boolean;
  title: string;
  hint?: string;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="block px-4 py-3 text-sm hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
    >
      <div className="font-medium flex items-center gap-2 flex-wrap">
        <span>{title}{external ? <span className="ml-1 text-[var(--text-dim)]" aria-hidden>↗</span> : null}</span>
        <LeagueStatusTag status={leagueStatusFor(href)} />
      </div>
      {hint && (
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{hint}</div>
      )}
    </a>
  );
}

const NAV_TONE_COLOR: Record<string, string> = {
  regular: "#10b981",
  playoffs: "#f59e0b",
  worldcup: "#a855f7",
  offseason: "#55556A",
};

function navShortStatus(label: string): string {
  return label.replace(/^Live\s*-\s*/, "");
}

// Compact Sports-menu item: a status dot + name + sport + short live-status,
// mirroring the /sports League hubs list. Replaces the wordy hint lines.
function SportsNavItem({ href, name, sport }: { href: string; name: string; sport: string }) {
  const status: LeagueStatus | null =
    href === "/teams/football" ? clubFootballStatus() : leagueStatusFor(href);
  const tone = status?.tone ?? "offseason";
  const color = NAV_TONE_COLOR[tone];
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 px-4 py-2 hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
    >
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 7, height: 7, background: color }}
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm leading-tight">{name}</span>
        <span className="block text-[11px] leading-tight" style={{ color: "var(--text-dim)" }}>{sport}</span>
      </span>
      {status && (
        <span className="text-[10px] whitespace-nowrap" style={{ color }}>
          {navShortStatus(status.label)}
        </span>
      )}
    </a>
  );
}

const OTHER_SPORTS = [
  { href: "/teams/ipl", name: "IPL", sport: "Cricket" },
  { href: "/teams/afl", name: "AFL", sport: "Aussie Rules" },
  { href: "/teams/nrl", name: "NRL", sport: "Rugby League" },
  { href: "/teams/cfl", name: "CFL", sport: "Canadian Football" },
  { href: "/teams/cricket", name: "Cricket", sport: "Cricket" },
  { href: "/teams/rugby-union", name: "Rugby Union", sport: "Rugby Union" },
  { href: "/teams/baseball", name: "Baseball", sport: "Baseball" },
  { href: "/teams/olympics", name: "Olympics", sport: "Olympics" },
  { href: "/teams/basketball", name: "Int'l Basketball", sport: "Basketball" },
  { href: "/teams/hockey", name: "Int'l Ice Hockey", sport: "Hockey" },
];

function otherSportsAggregate(): { color: string; label: string } {
  const live = OTHER_SPORTS.map((s) => leagueStatusFor(s.href)).filter(
    (s): s is LeagueStatus => !!s && s.tone !== "offseason",
  );
  if (live.length === 0) return { color: NAV_TONE_COLOR.offseason, label: "Offseason" };
  const order = ["worldcup", "playoffs", "regular"];
  const tone = order.find((t) => live.some((s) => s.tone === t)) ?? "regular";
  return { color: NAV_TONE_COLOR[tone], label: live.length + " live" };
}

// Expandable "Other Sports" row inside the Sports dropdown. Click to reveal the
// minor league hubs. stopPropagation keeps the parent dropdown from closing.
function SportsNavGroup() {
  const [open, setOpen] = useState(false);
  const agg = otherSportsAggregate();
  return (
    <div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-expanded={open}
        className="w-full text-left flex items-center gap-2.5 px-4 py-2 hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
      >
        <span className="inline-block rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: agg.color }} aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm leading-tight">Other Sports</span>
          <span className="block text-[11px] leading-tight" style={{ color: "var(--text-dim)" }}>IPL &middot; AFL &middot; NRL &middot; CFL &middot; Cricket &middot; Rugby &middot; Baseball &middot; Olympics</span>
        </span>
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div>
          {OTHER_SPORTS.map((s) => (
            <div key={s.href} className="pl-3">
              <SportsNavItem href={s.href} name={s.name} sport={s.sport} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DesktopNav({ updated }: { updated: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Close any open dropdown on escape.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  return (
    <div className="hidden md:flex gap-6 items-center">
      <a href="/#rankings" className="text-sm hover:text-[var(--accent)] transition-colors">
        Rankings
      </a>

      <Dropdown id="data" label="Geography" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/expandable-map" title="Expandable Map" hint="Full-corpus interactive map; resizable canvas, persistent filters and viewport" />
        <DropdownItem href="/compare" title="Compare" hint="Side-by-side any 2 to 4 metros" />
        <DropdownItem href="/countries" title="Countries" hint="Population, metros, and composite score by country" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/badges" title="Badges" hint="Categorical lenses over the dataset" />
        <DropdownItem href="/matchups/london-vs-new-york" title="Matchups" hint="Head-to-head metro pages" />
        <DropdownItem href="/random" title="🎲 Random metro" hint="Tier-weighted random pick" />
      </Dropdown>

      <Dropdown id="sports" label="Sports" openId={openId} setOpenId={setOpenId}>
        <a
          href="/sports"
          className="block px-4 py-2.5 text-sm font-medium hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
        >
          All sports <span aria-hidden className="text-[var(--text-dim)]">→</span>
        </a>
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <SportsNavItem href="/teams/football" name="Club Football" sport="Football" />
        <SportsNavItem href="/teams/national" name="International Football" sport="Football" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <SportsNavItem href="/teams/nfl" name="NFL" sport="American Football" />
        <SportsNavItem href="/teams/cfb" name="College Football" sport="American Football" />
        <SportsNavItem href="/teams/mlb" name="MLB" sport="Baseball" />
        <SportsNavItem href="/teams/nba" name="NBA" sport="Basketball" />
        <SportsNavItem href="/teams/nhl" name="NHL" sport="Ice Hockey" />
        <SportsNavGroup />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <SportsNavItem href="/teams/wfootball" name="Women's Football" sport="Football" />
        <SportsNavItem href="/teams/wnba" name="WNBA" sport="Basketball" />
      </Dropdown>

      <Dropdown id="articles" label="Deep Dives" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/deep-dives" title="All deep dives →" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/sports/geography-of-erasure" title="The Geography of Erasure" />
        <DropdownItem href="/sports/games" title="The Greatest Games" />
        <DropdownItem href="/sports/valuations" title="Team Valuations" />
        <DropdownItem href="/top-teams" title="The Team That Wins the City" />
        <DropdownItem href="/neighborhoods" title="The Last of the Marylebones" />
        <DropdownItem href="/badges/velvet-rock-capital" title="Velvet Rock Capital" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="https://citizenofnowhere.substack.com" external title="On Substack" />
      </Dropdown>

      <Link href="/methodology" className="text-sm hover:text-[var(--accent)] transition-colors">
        Methodology
      </Link>
      <Link href="/about" className="text-sm hover:text-[var(--accent)] transition-colors">
        About
      </Link>

      {updated && (
        <a
          href="/updates"
          className="hidden lg:inline-block text-xs text-[var(--text-muted)] hover:text-[var(--accent)] border rounded px-2 py-1 whitespace-nowrap transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
          title={`Source data last updated ${updated}. Click for full release notes.`}
        >
          Updated {updated}
        </a>
      )}
    </div>
  );
}

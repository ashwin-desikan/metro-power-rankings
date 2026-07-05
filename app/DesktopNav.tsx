"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { leagueStatusFor, clubFootballStatus, LeagueStatusTag, type LeagueStatus } from "@/lib/leagueStatus";
import { catalogByFamily, boardLabelFor, SPORTS_FEATURES, type CatalogEntry } from "@/lib/sportsCatalog";

// Client-side desktop nav. Replaces the pure-CSS hover dropdowns that were
// failing on touch and slow-hover environments. Each dropdown is now a
// proper React state toggle: click opens, click outside closes, escape
// closes. Hover still works on desktop (mouseenter opens; the menu does
// not close on mouseleave because click-to-open users expect it to stay).
//
// Geography and Sports are grouped mega-menus (multi-column, section
// headers). The Sports directory is generated from lib/sportsCatalog, so the
// desktop menu, the mobile menu and /sports never drift as leagues are added.

type DropdownProps = {
  id: string;
  label: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  children: React.ReactNode;
  minWidth?: number;
  href?: string;
};

function Caret() {
  return (
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
  );
}

function Dropdown({ id, label, openId, setOpenId, children, minWidth = 260, href }: DropdownProps) {
  const isOpen = openId === id;
  const wrapRef = useRef<HTMLDivElement | null>(null);

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
      {href ? (
        // Top-level item that both navigates (click) and reveals its menu (hover).
        <a
          href={href}
          onMouseEnter={() => setOpenId(id)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className="text-sm hover:text-[var(--accent)] transition-colors flex items-center gap-1 py-1"
        >
          {label}
          <Caret />
        </a>
      ) : (
        <button
          type="button"
          onClick={() => setOpenId(isOpen ? null : id)}
          onMouseEnter={() => setOpenId(id)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className="text-sm hover:text-[var(--accent)] transition-colors flex items-center gap-1 py-1"
        >
          {label}
          <Caret />
        </button>
      )}
      {isOpen && (
        <div
          className="absolute right-0 top-full pt-2"
          style={{ minWidth: `${minWidth}px`, maxWidth: "calc(100vw - 2rem)" }}
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

function MenuGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider"
      style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
    >
      {children}
    </div>
  );
}

function MenuLink({
  href,
  title,
  external,
}: {
  href: string;
  title: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="block px-2 py-1.5 rounded text-sm hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
    >
      {title}
      {external ? <span className="ml-1 text-[var(--text-dim)]" aria-hidden>↗</span> : null}
    </a>
  );
}

function SportsFeatureLink({ href, label, live }: { href: string; label: string; live?: boolean }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2 px-2 py-1.5 rounded text-[13px] hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
    >
      {live && (
        <span className="inline-block rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: "#10b981" }} aria-hidden />
      )}
      <span>{label}</span>
    </a>
  );
}

function SportsMegaItem({ entry }: { entry: CatalogEntry }) {
  const status: LeagueStatus | null =
    entry.href === "/teams/football" ? clubFootballStatus() : leagueStatusFor(entry.href);
  const active = !!status && status.tone !== "offseason";
  const color = status ? NAV_TONE_COLOR[status.tone] : undefined;
  return (
    <a
      href={entry.href}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-[13px] hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
    >
      {active && (
        <span className="inline-block rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: color }} aria-hidden />
      )}
      <span>{boardLabelFor(entry)}</span>
    </a>
  );
}

export default function DesktopNav({ updated }: { updated: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const sportsFamilies = catalogByFamily(false);

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
      <Dropdown id="data" label="Geography" href="/geography" openId={openId} setOpenId={setOpenId} minWidth={480}>
        <div className="p-2 grid grid-cols-2 gap-x-4">
          <div>
            <MenuGroupLabel>Places &amp; directories</MenuGroupLabel>
            <MenuLink href="/rankings" title="Metro Power Rankings" />
            <MenuLink href="/countries" title="Countries" />
            <MenuLink href="/states" title="States &amp; Provinces" />
            <MenuLink href="/expandable-map" title="Expandable Map" />
            <MenuLink href="/compare" title="Compare metros" />
            <MenuLink href="/matchups/london-vs-new-york" title="Matchups" />
          </div>
          <div>
            <MenuGroupLabel>Power &amp; people</MenuGroupLabel>
            <MenuLink href="/power" title="The Nowhere 100" />
            <MenuLink href="/billionaires" title="Billionaires" />
            <MenuLink href="/leaders" title="World Leaders" />
            <MenuLink href="/power-atlas" title="The Power Atlas" />
            <MenuLink href="/us-political-leadership" title="US Political Leadership" />
            <MenuLink href="/mayors" title="Mayors of the World" />
            <MenuGroupLabel>Geopolitics</MenuGroupLabel>
            <MenuLink href="/orgs" title="Alliances &amp; Orgs" />
            <MenuLink href="/conflicts" title="Interstate Wars" />
          </div>
        </div>
        <div className="border-t px-2 py-1.5 flex gap-2" style={{ borderColor: "var(--border)" }}>
          <MenuLink href="/badges" title="Badges" />
          <MenuLink href="/random" title="🎲 Random metro" />
        </div>
      </Dropdown>

      <Dropdown id="sports" label="Sports" href="/sports" openId={openId} setOpenId={setOpenId} minWidth={660}>
        <div className="grid" style={{ gridTemplateColumns: "210px 1fr" }}>
          <div className="p-2 border-r" style={{ borderColor: "var(--border)" }}>
            <a
              href="/sports"
              className="block px-2 py-1.5 rounded text-sm font-medium hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
            >
              Zone Zero Sports Hub <span aria-hidden className="text-[var(--text-dim)]">→</span>
            </a>
            <MenuGroupLabel>Across all sports</MenuGroupLabel>
            {SPORTS_FEATURES.map((f) => (
              <SportsFeatureLink key={f.href} href={f.href} label={f.label} live={f.live} />
            ))}
          </div>
          <div className="p-2" style={{ columnCount: 3, columnGap: "0.75rem" }}>
            {sportsFamilies.map((g) => (
              <div key={g.family} className="mb-1.5" style={{ breakInside: "avoid" }}>
                <MenuGroupLabel>{g.family}</MenuGroupLabel>
                {g.entries.map((e) => (
                  <SportsMegaItem key={e.href} entry={e} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="border-t px-3 py-2 flex gap-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <a href="/sports" className="hover:text-[var(--accent)] transition-colors">Open the sports map <span aria-hidden>→</span></a>
          <a href="/sports#league-directory" className="hover:text-[var(--accent)] transition-colors">Browse all leagues <span aria-hidden>→</span></a>
        </div>
      </Dropdown>

      <Dropdown id="sound" label="Sound" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/sound" title="The Sound of the Metros →" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/sound/charts" title="Live Charts" />
        <DropdownItem href="/sound/rankings" title="Rankings by Metro" />
        <DropdownItem href="/sound/artists" title="Artists" />
        <DropdownItem href="/sound/decades" title="Decades" />
        <DropdownItem href="/sound/scenes" title="Scenes" />
        <DropdownItem href="/sound/velvet-rock" title="Velvet Rock" />
        <DropdownItem href="/sound/grammys" title="Awards History" />
        <DropdownItem href="/sound/rolling-stone-500" title="RS 500 Greatest Albums" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/sound/number-ones" title="Number-One Machines" />
        <DropdownItem href="/sound/reigns" title="Longest Reigns" />
        <DropdownItem href="/sound/disagreements" title="Chart Disagreements" />
        <DropdownItem href="/sound/transatlantic" title="The Transatlantic Divide" />
        <DropdownItem href="/sound/christmas" title="UK December #1s" />
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

      <Dropdown id="play" label="Play" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/play" title="Kids Games" hint="Free learning games for younger fans" />
        <DropdownItem href="/play/arcade" title="Games" hint="Bigger games: random metro, quizzes and more" />
      </Dropdown>

      <Dropdown id="about" label="About" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/about" title="About" hint="The project, the author, and the why" />
        <DropdownItem href="/methodology" title="Methodology" hint="How the rankings are built" />
      </Dropdown>
      <Link href="/studio" className="text-sm hover:text-[var(--accent)] transition-colors">
        Studio
      </Link>
      <Link href="/me" className="text-sm hover:text-[var(--accent)] transition-colors flex items-center gap-1" title="Metros and teams you follow">
        <span aria-hidden>★</span> Following
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

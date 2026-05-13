"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
      <div className="font-medium">{title}{external ? <span className="ml-1 text-[var(--text-dim)]" aria-hidden>↗</span> : null}</div>
      {hint && (
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{hint}</div>
      )}
    </a>
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

      <Dropdown id="data" label="Data" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/compare" title="Compare" hint="Side-by-side any 2 to 4 metros" />
        <DropdownItem href="/countries" title="Countries" hint="Population, metros, and composite score by country" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/badges" title="Badges" hint="Categorical lenses over the dataset" />
        <DropdownItem href="/matchups/london-vs-new-york" title="Matchups" hint="Head-to-head metro pages" />
        <DropdownItem href="/random" title="🎲 Random metro" hint="Tier-weighted random pick" />
      </Dropdown>

      <a href="/#regions" className="text-sm hover:text-[var(--accent)] transition-colors">
        Regions
      </a>

      <Dropdown id="sports" label="Sports" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/teams/nfl" title="NFL" hint="All 32 active franchises, sortable. Defunct franchises link from inside." />
        <DropdownItem href="/teams/mlb" title="MLB" hint="All 30 active franchises, sortable. Defunct franchises link from inside." />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-dim)" }}>
          NBA and NHL pages coming next.
        </div>
      </Dropdown>

      <Dropdown id="articles" label="Articles" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="https://citizenofnowhere.substack.com" external title="Citizen of Nowhere" hint="All essays on Substack" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/neighborhoods" title="The Last of the Marylebones" hint="Global neighborhoods reference" />
        <DropdownItem href="/top-teams" title="The Team That Wins the City" hint="Top sports team by metro" />
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

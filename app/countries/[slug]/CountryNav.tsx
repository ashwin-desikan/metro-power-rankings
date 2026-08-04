"use client";

// "On this page" nav for country pages. Visually identical to the shared
// server-rendered app/teams/HubNav.tsx (same chip metrics, same tokens) but
// adds two things HubNav deliberately does not have, because HubNav is used by
// every sports hub and making it a client component would ship this JS to all
// of them:
//
//   1. Scrollspy. Country pages carry up to 13 sections; without an active
//      state you lose your place halfway down.
//   2. Cluster labels. 13 undifferentiated chips scan as noise; four named
//      groups scan as a table of contents.
//
// Degrades honestly: with JS off it is still a plain list of anchor links, and
// the global `[id] { scroll-margin-top }` rule in globals.css handles the
// sticky-header offset exactly as it does for HubNav.

import { useEffect, useMemo, useRef, useState } from "react";

export type CountryNavItem = { label: string; href: string; group: string };

// Render order. Within a group, chip order follows DOM order; see page.tsx.
export const NAV_GROUPS = ["Overview", "Governance", "Regions", "Society"] as const;

export default function CountryNav({ items }: { items: CountryNavItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  const ids = useMemo(
    () => items.map((i) => i.href.replace(/^#/, "")).filter(Boolean),
    [items],
  );

  useEffect(() => {
    if (!ids.length || typeof IntersectionObserver === "undefined") return;

    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        // Active = the most-visible section in the band. Ties resolve to
        // document order so the chip does not flicker between neighbours.
        let best: string | null = null;
        let bestRatio = 0;
        for (const id of ids) {
          const r = seen.get(id) ?? 0;
          if (r > bestRatio) {
            best = id;
            bestRatio = r;
          }
        }
        if (best) setActive(best);
      },
      {
        // Band across the upper-middle of the viewport: a section counts as
        // current once its top clears the sticky nav, and stops counting well
        // before it leaves the screen.
        rootMargin: "-15% 0px -70% 0px",
        threshold: [0, 0.25, 0.5, 1],
      },
    );

    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n != null);
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [ids]);

  // Keep the active chip in view on phones, where the row scrolls sideways.
  //
  // ⚠️ This MUST only ever move the nav's own scrollLeft. The first version
  // called el.scrollIntoView({block:"nearest"}), which walks up to the nearest
  // SCROLLABLE ANCESTOR - and on >=sm this row is `overflow-visible`, so that
  // ancestor is the document. Every time the observer changed the active
  // section it dragged the page back to the nav, making country pages
  // impossible to scroll past the header. Shipped and reverted 2026-08-04.
  // Never reintroduce scrollIntoView here.
  useEffect(() => {
    const nav = navRef.current;
    if (!active || !nav) return;
    if (nav.scrollWidth <= nav.clientWidth) return; // not scrollable: do nothing
    const el = nav.querySelector<HTMLAnchorElement>(`a[href="#${CSS.escape(active)}"]`);
    if (!el) return;
    const navBox = nav.getBoundingClientRect();
    const elBox = el.getBoundingClientRect();
    const pad = 12;
    if (elBox.left < navBox.left) {
      nav.scrollLeft -= navBox.left - elBox.left + pad;
    } else if (elBox.right > navBox.right) {
      nav.scrollLeft += elBox.right - navBox.right + pad;
    }
  }, [active]);

  if (!items || items.length < 2) return null;

  const groups = NAV_GROUPS.map((g) => ({
    name: g,
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  return (
    <nav
      ref={navRef}
      aria-label="On this page"
      className="mb-8 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto sm:overflow-visible"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 min-w-0">
        {groups.map((g, gi) => (
          <div key={g.name} className="flex flex-wrap items-center gap-2">
            <span
              className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] whitespace-nowrap"
              style={{ marginLeft: gi === 0 ? 0 : "0.25rem" }}
            >
              {g.name}
            </span>
            {g.items.map((it) => {
              const id = it.href.replace(/^#/, "");
              const on = id === active;
              return (
                <a
                  key={it.href}
                  href={it.href}
                  aria-current={on ? "true" : undefined}
                  className="text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap hover:text-[var(--text)] hover:border-[var(--text-dim)]"
                  style={{
                    background: on ? "var(--accent)" : "var(--bg-card)",
                    color: on ? "#fff" : "var(--text-muted)",
                    borderColor: on ? "var(--accent)" : "var(--border)",
                  }}
                >
                  {it.label}
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

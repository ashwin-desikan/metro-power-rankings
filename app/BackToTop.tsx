"use client";

import { useEffect, useState } from "react";

// Floating back-to-top button, mounted once in the root layout. Appears
// after scrolling past ~1.5 screens so it doesn't clutter short pages, and
// is most useful on the site's very long detail pages (a metro page can run
// 40,000+ px tall on a phone) where the top nav and "On this page" chips are
// long gone by the time a reader wants to jump back or re-orient.
const SHOW_AFTER_PX = 900;

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
      className="fixed bottom-5 right-5 z-40 w-11 h-11 rounded-full border flex items-center justify-center text-lg shadow-lg transition-colors hover:text-[var(--accent)] hover:border-[var(--accent)]"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-muted)" }}
    >
      <span aria-hidden="true">&uarr;</span>
    </button>
  );
}

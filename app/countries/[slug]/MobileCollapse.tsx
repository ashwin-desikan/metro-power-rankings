"use client";

// Closes the sections marked `collapseOnMobile` when the viewport is phone-sized,
// and reopens them if the viewport grows past the breakpoint.
//
// Why a client component rather than markup or CSS: <details open> is a DOM
// attribute, not a style, so it cannot be driven by a media query. The
// alternatives were worse - shipping those sections closed in the HTML would
// hide the content from crawlers and no-JS readers on every viewport, and
// faking the collapse with CSS on the UA-hidden slot is brittle across engines.
//
// So the sections render OPEN on the server and this closes them on phones
// after mount. There is a brief flash of open content on a narrow screen; that
// is the deliberate trade for keeping the content in the initial HTML.
//
// Only ever touches sections the author opted in via data-collapse-mobile, and
// never fights the reader: once someone toggles a section by hand it is left
// alone for the rest of the visit.

import { useEffect } from "react";

const MOBILE = "(max-width: 639px)";

export default function MobileCollapse() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(MOBILE);
    const touched = new WeakSet<HTMLDetailsElement>();

    const nodes = Array.from(
      document.querySelectorAll<HTMLDetailsElement>("details[data-collapse-mobile]"),
    );
    if (nodes.length === 0) return;

    // A manual toggle opts that section out permanently.
    const onToggle = (e: Event) => touched.add(e.currentTarget as HTMLDetailsElement);
    nodes.forEach((n) => n.addEventListener("toggle", onToggle));

    const apply = () => {
      for (const n of nodes) {
        if (touched.has(n)) continue;
        n.open = !mq.matches;
      }
    };

    // Skip the very first toggle events fired by apply() itself, otherwise
    // every section would immediately mark itself as reader-touched.
    nodes.forEach((n) => n.removeEventListener("toggle", onToggle));
    apply();
    const id = window.setTimeout(() => nodes.forEach((n) => n.addEventListener("toggle", onToggle)), 0);

    mq.addEventListener("change", apply);
    return () => {
      window.clearTimeout(id);
      mq.removeEventListener("change", apply);
      nodes.forEach((n) => n.removeEventListener("toggle", onToggle));
    };
  }, []);

  return null;
}

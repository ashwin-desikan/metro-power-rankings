"use client";

import { useEffect, useState } from "react";

// A clip attached to a single game row. videoId plays inline (embeddable,
// privacy-mode). When a clip has embedding disabled, leave videoId undefined
// and set href so the button opens it on YouTube instead. href can also carry
// a secondary link (e.g. the full game) alongside an inline highlight.
export type GameVideo = {
  videoId?: string;
  title: string;
  href?: string;
  hrefLabel?: string;
};

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const pill =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]";

export function WatchButton({ video }: { video: GameVideo }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // No embeddable clip: render an outbound link to YouTube.
  if (!video.videoId) {
    if (!video.href) return null;
    return (
      <div className="mt-1">
        <a
          href={video.href}
          target="_blank"
          rel="noopener noreferrer"
          className={pill}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <PlayIcon />
          {video.hrefLabel ?? "Watch"} &#8599;
        </a>
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={pill}
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        aria-label={`Watch: ${video.title}`}
      >
        <PlayIcon />
        Watch
      </button>
      {video.href ? (
        <a
          href={video.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--accent)] underline decoration-dotted whitespace-nowrap"
        >
          {video.hrefLabel ?? "YouTube"} &#8599;
        </a>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.82)" }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div
              className="relative w-full overflow-hidden rounded-lg"
              style={{ aspectRatio: "16 / 9", background: "#000" }}
            >
              <iframe
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0`}
                title={video.title}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/85">
              <span className="truncate">{video.title}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-white/30 px-2 py-0.5 hover:bg-white/10 whitespace-nowrap"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

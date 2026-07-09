"use client";

import { useState } from "react";

/**
 * Share row: a native share-sheet button where the Web Share API is
 * available (most mobile browsers), plus Reddit/LinkedIn links that always
 * work as a fallback (desktop browsers mostly lack navigator.share).
 *
 * containerClassName/linkClassName let call sites match their surrounding
 * layout (e.g. equal-width flex-1 buttons in a narrow sidebar card vs.
 * natural-width wrapped buttons in a full-width share section).
 */
export default function ShareRow({
  url,
  title,
  containerClassName = "flex gap-3 text-sm flex-wrap",
  linkClassName = "rounded border px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors",
}: {
  url: string;
  title: string;
  containerClassName?: string;
  linkClassName?: string;
}) {
  const [canShare, setCanShare] = useState<boolean | null>(null);
  if (canShare === null && typeof navigator !== "undefined") {
    setCanShare(typeof navigator.share === "function");
  }

  async function nativeShare() {
    try {
      await navigator.share({ url, title });
    } catch {
      /* user cancelled the share sheet - nothing to do */
    }
  }

  return (
    <div className={containerClassName} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {canShare && (
        <button type="button" onClick={nativeShare} className={linkClassName} style={{ borderColor: "var(--border)" }}>
          Share&hellip;
        </button>
      )}
      <a
        href={`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        style={{ borderColor: "var(--border)" }}
        title={`Share ${title} on Reddit`}
      >
        Reddit
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        style={{ borderColor: "var(--border)" }}
        title={`Share ${title} on LinkedIn`}
      >
        LinkedIn
      </a>
    </div>
  );
}

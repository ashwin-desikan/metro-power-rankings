"use client";

import { useState } from "react";

export default function CopyButton({
  value,
  label = "Copy URL",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fall back to prompt
      window.prompt("Copy this URL:", value);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-xs px-2 py-1 rounded border hover:border-[var(--accent)] transition-colors"
      style={{
        borderColor: "var(--border)",
        color: copied ? "var(--accent)" : "var(--text-muted)",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

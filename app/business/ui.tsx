import Link from "next/link";
import type { ReactNode } from "react";

// Shared presentational bits for the /business hub tabs. Server-safe (no
// hooks); client components import the constants freely.

export const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
export const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
export const TH = "px-3 py-2 font-semibold";
export const THR = "px-3 py-2 text-right font-semibold";
export const TD = "px-3 py-2";
export const TDR = "px-3 py-2 text-right";

export function fmtT(n: number): string {
  return `$${(n / 1e12).toFixed(2)}T`;
}

export function fmtCap(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(0) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toFixed(0);
}

export function fmtEmpDash(n: number | null | undefined): string {
  return n ? n.toLocaleString() : "—";
}

export function MetroLink({ name, slug }: { name: string | null | undefined; slug: string }) {
  if (!name) return <span style={{ color: "var(--text-dim)" }}>—</span>;
  if (!slug) return <span>{name}</span>;
  return (
    <Link href={`/rankings/${slug}`} className="hover:underline">
      {name}
    </Link>
  );
}

export function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h2 className="text-2xl font-bold mb-1">{title}</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">{sub}</p>
    </>
  );
}

export function Crumbs({ tab }: { tab?: string }) {
  return (
    <nav className="text-xs text-[var(--text-muted)] mb-4">
      <Link href="/" className="hover:underline">Home</Link>
      {" / "}
      {tab ? (
        <>
          <Link href="/business" className="hover:underline">Business</Link>
          {" / "}
          <span>{tab}</span>
        </>
      ) : (
        <span>Business</span>
      )}
    </nav>
  );
}

export function TabHeader({ emoji, title, sub, stamp }: {
  emoji: string; title: string; sub: string; stamp?: string | null;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
        <span aria-hidden>{emoji}</span> {title}
      </h1>
      <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">{sub}</p>
      {stamp && (
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
          {stamp}
        </p>
      )}
    </header>
  );
}

export function TableBox({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

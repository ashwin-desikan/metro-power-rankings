import type { Metadata } from "next";
import Link from "next/link";
import { loadFeedback, type FeedbackRow } from "@/lib/feedback";
import StatusControls from "./StatusControls";

export const metadata: Metadata = {
  title: "Mission Control - Feedback",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const KIND_LABEL: Record<FeedbackRow["kind"], string> = {
  correction: "Wrong",
  coverage: "Missing",
  bug: "Broken",
  idea: "Idea",
};

function fmtRelative(iso: string): string {
  const sec = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export default async function AdminFeedbackPage() {
  const rows = await loadFeedback();
  const open = rows.filter((r) => r.status === "new" || r.status === "triaged");
  const closed = rows.filter((r) => r.status === "fixed" || r.status === "declined");

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4">
        <Link href="/admin" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
          &larr; Mission Control
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reader feedback</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {open.length} open, {closed.length} closed. Corrections first: a wrong figure on a
          reference site costs more than a missing feature.
        </p>
      </header>

      {rows.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] italic">
          Nothing yet. If this stays empty after the footer has shipped, check that
          SUPABASE_SERVICE_ROLE_KEY is set in the Vercel project.
        </p>
      )}

      {[
        { title: "Open", items: open },
        { title: "Closed", items: closed },
      ]
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.title} className="mb-8">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-2">
              {g.title} ({g.items.length})
            </h2>
            <div className="space-y-2">
              {g.items.map((r) => (
                <article key={r.id} className="rounded-lg border p-3" style={cardStyle}>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5 text-[11px] text-[var(--text-dim)]">
                    <span
                      className="px-1.5 py-0.5 rounded border"
                      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                    >
                      {KIND_LABEL[r.kind]}
                    </span>
                    <Link
                      href={r.path}
                      className="text-[var(--accent)] hover:underline truncate max-w-[18rem]"
                      style={mono}
                    >
                      {r.path}
                    </Link>
                    <span>{fmtRelative(r.created_at)}</span>
                    {r.user_email && (
                      <a href={`mailto:${r.user_email}`} className="hover:text-[var(--accent)]">
                        {r.user_name ? `${r.user_name} · ` : ""}
                        {r.user_email}
                      </a>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{r.body}</p>
                  <div className="mt-2">
                    <StatusControls id={r.id} status={r.status} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
    </main>
  );
}

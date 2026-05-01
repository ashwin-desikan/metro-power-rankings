import type { Metadata } from "next";
import Link from "next/link";
import {
  type Digest,
  type DigestFinding,
  type QueueEntry,
  type QueueStatus,
  findingId,
  isAlreadyQueued,
  listDigestDates,
  loadLatestDigest,
  loadQueue,
} from "@/lib/missionControl";
import { BASE_URL } from "@/lib/seo";
import { computeTier } from "@/lib/tiers";
import CopyButton from "./CopyButton";

export const metadata: Metadata = {
  title: "Mission Control",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------- Helpers (server-only formatting) ----------

function fmtDate(iso: string): string {
  // ISO date -> "May 1, 2026"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function statusPillStyle(s: QueueStatus): { bg: string; fg: string } {
  if (s === "shipped") return { bg: "rgba(78, 205, 196, 0.16)", fg: "#4ECDC4" };
  if (s === "skipped") return { bg: "rgba(85, 85, 106, 0.2)", fg: "#8888A0" };
  return { bg: "rgba(123, 104, 238, 0.18)", fg: "#a89cf0" }; // draft
}

function shareUrlForSlug(slug: string): string {
  return `${BASE_URL}/rankings/${slug}`;
}

function ogUrlForSlug(slug: string): string {
  // Next.js auto-generated route: <page-path>/opengraph-image
  return `${BASE_URL}/rankings/${slug}/opengraph-image`;
}

// ---------- Panel: Today's anomaly digest ----------

function FindingCard({
  finding,
  digestDate,
  alreadyQueued,
}: {
  finding: DigestFinding;
  digestDate: string;
  alreadyQueued: boolean;
}) {
  const id = findingId(digestDate, finding);
  const shareUrl = shareUrlForSlug(finding.slug);
  const ogUrl = ogUrlForSlug(finding.slug);

  const meta: string[] = [];
  if (finding.rank != null) meta.push(`#${finding.rank}`);
  meta.push(finding.country);
  meta.push(`score ${finding.score.toFixed(1)}`);
  meta.push(`tier: ${computeTier(finding.score).name}`);

  return (
    <div
      className="border rounded-lg p-4"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <Link
            href={`/rankings/${finding.slug}`}
            target="_blank"
            className="text-base font-semibold hover:text-[var(--accent)]"
          >
            {finding.name}
          </Link>
          <p
            className="text-xs text-[var(--text-muted)] mt-0.5"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {meta.join(" · ")}
          </p>
        </div>
        {alreadyQueued ? (
          <span
            className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider"
            style={{
              backgroundColor: "rgba(78, 205, 196, 0.16)",
              color: "var(--accent)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Queued
          </span>
        ) : null}
      </div>

      {finding.pair_label ? (
        <p className="text-xs text-[var(--text-dim)] mb-2 uppercase tracking-wider">
          {finding.pair_label}
        </p>
      ) : null}

      <p className="text-sm text-[var(--text)] leading-relaxed mb-4 italic">
        {finding.story_angle}
      </p>

      <div className="flex flex-wrap gap-2">
        {!alreadyQueued ? (
          <form method="POST" action="/api/admin/queue/add">
            <input type="hidden" name="digestDate" value={digestDate} />
            <input type="hidden" name="category" value={finding.category} />
            <input type="hidden" name="slug" value={finding.slug} />
            <input
              type="hidden"
              name="pairLabel"
              value={finding.pair_label ?? finding.dominant_dim ?? ""}
            />
            <input type="hidden" name="metroName" value={finding.name} />
            <input type="hidden" name="country" value={finding.country} />
            <input
              type="hidden"
              name="storyAngle"
              value={finding.story_angle}
            />
            <button
              type="submit"
              className="text-xs px-2.5 py-1 rounded font-semibold transition-colors"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Mark drafted
            </button>
          </form>
        ) : null}
        <a
          href={ogUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-2 py-1 rounded border hover:border-[var(--accent)] transition-colors"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Open OG
        </a>
        <CopyButton value={shareUrl} label="Copy URL" />
      </div>
      <p
        className="text-[10px] text-[var(--text-dim)] mt-2"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        suppressHydrationWarning
      >
        id: {id.slice(0, 32)}…
      </p>
    </div>
  );
}

function DigestPanel({
  digest,
  queue,
}: {
  digest: Digest | null;
  queue: QueueEntry[];
}) {
  if (!digest) {
    return (
      <section
        className="border rounded-lg p-6"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border)",
        }}
      >
        <h2 className="text-lg font-bold mb-2">Today&apos;s digest</h2>
        <p className="text-sm text-[var(--text-muted)]">
          No digest found in <code>/digests/</code>. Run{" "}
          <code className="text-[var(--accent)]">
            python scripts/mine_anomalies.py
          </code>{" "}
          to generate one.
        </p>
      </section>
    );
  }

  const queuedSourceIds = new Set(
    queue.map(
      (e) =>
        `${e.source.digestDate}::${e.source.category}::${e.source.slug}::${
          e.source.pairLabel ?? "obscurity"
        }`,
    ),
  );

  const sections: Array<{
    label: string;
    blurb: string;
    findings: DigestFinding[];
  }> = [
    {
      label: "Polarity",
      blurb: "High on one dimension, low on a related one. The gap is the story.",
      findings: digest.findings.polarity,
    },
    {
      label: "Sensitivity",
      blurb: "Composite leans on a single dimension. Identity is fragile to reweighting.",
      findings: digest.findings.sensitivity,
    },
    {
      label: "Obscurity",
      blurb: "Ranked higher on score than population. Punching above weight.",
      findings: digest.findings.obscurity,
    },
  ];

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Today&apos;s digest</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {fmtDate(digest.date)} · {digest.counts.polarity} polarity ·{" "}
            {digest.counts.sensitivity} sensitivity · {digest.counts.obscurity}{" "}
            obscurity
          </p>
        </div>
      </header>
      <div className="space-y-8">
        {sections.map((s) => (
          <div key={s.label}>
            <h3
              className="text-sm font-semibold mb-1"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {s.label.toUpperCase()}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">{s.blurb}</p>
            {s.findings.length === 0 ? (
              <p className="text-sm text-[var(--text-dim)]">
                No findings in this category today.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {s.findings.map((f) => (
                  <FindingCard
                    key={`${f.category}-${f.slug}-${f.pair_label ?? f.dominant_dim ?? "x"}`}
                    finding={f}
                    digestDate={digest.date}
                    alreadyQueued={queuedSourceIds.has(
                      findingId(digest.date, f),
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Panel: Distribution queue ----------

function QueueRow({ entry }: { entry: QueueEntry }) {
  const pill = statusPillStyle(entry.status);
  const shareUrl = shareUrlForSlug(entry.source.slug);

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="py-3 pr-4 align-top">
        <div className="font-semibold">
          <Link
            href={`/rankings/${entry.source.slug}`}
            target="_blank"
            className="hover:text-[var(--accent)]"
          >
            {entry.metroName}
          </Link>
        </div>
        <div className="text-xs text-[var(--text-muted)]">{entry.country}</div>
        <div className="text-xs text-[var(--text-dim)] italic mt-1 max-w-md">
          {entry.storyAngle}
        </div>
        {entry.notes ? (
          <div className="text-xs text-[var(--text-muted)] mt-1">
            <span className="text-[var(--text-dim)]">notes:</span> {entry.notes}
          </div>
        ) : null}
        {entry.statusReason ? (
          <div className="text-xs text-[var(--text-muted)] mt-1">
            <span className="text-[var(--text-dim)]">skip reason:</span>{" "}
            {entry.statusReason}
          </div>
        ) : null}
      </td>
      <td className="py-3 pr-4 align-top">
        <span
          className="inline-block text-[10px] px-2 py-0.5 rounded uppercase tracking-wider"
          style={{
            backgroundColor: pill.bg,
            color: pill.fg,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {entry.status}
        </span>
        <div
          className="text-[10px] text-[var(--text-dim)] mt-1"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {entry.channel}
        </div>
      </td>
      <td
        className="py-3 pr-4 align-top text-xs text-[var(--text-muted)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        suppressHydrationWarning
      >
        {fmtRelative(entry.updatedAt)}
      </td>
      <td className="py-3 align-top">
        <div className="flex flex-wrap gap-2">
          {entry.status !== "shipped" ? (
            <form method="POST" action="/api/admin/queue/update">
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="status" value="shipped" />
              <button
                type="submit"
                className="text-xs px-2 py-1 rounded font-semibold"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Mark shipped
              </button>
            </form>
          ) : null}
          {entry.status !== "skipped" ? (
            <form
              method="POST"
              action="/api/admin/queue/update"
              onSubmit={undefined}
            >
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="status" value="skipped" />
              <input
                type="text"
                name="statusReason"
                placeholder="reason"
                required
                className="text-xs px-2 py-1 rounded border bg-transparent w-24"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
              <button
                type="submit"
                className="text-xs px-2 py-1 rounded border ml-1"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-muted)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Skip
              </button>
            </form>
          ) : null}
          {entry.status !== "draft" ? (
            <form method="POST" action="/api/admin/queue/update">
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="status" value="draft" />
              <button
                type="submit"
                className="text-xs px-2 py-1 rounded border"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-muted)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Reopen
              </button>
            </form>
          ) : null}
          <CopyButton value={shareUrl} label="Copy URL" />
          <a
            href={ogUrlForSlug(entry.source.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 rounded border"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-muted)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            OG
          </a>
          <form
            method="POST"
            action="/api/admin/queue/delete"
          >
            <input type="hidden" name="id" value={entry.id} />
            <button
              type="submit"
              className="text-xs px-2 py-1 rounded border"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-dim)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
              title="Remove from queue"
            >
              Delete
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

function QueuePanel({ entries }: { entries: QueueEntry[] }) {
  const draft = entries.filter((e) => e.status === "draft");
  const shipped = entries.filter((e) => e.status === "shipped");
  const skipped = entries.filter((e) => e.status === "skipped");

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Distribution queue</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {draft.length} drafted · {shipped.length} shipped · {skipped.length}{" "}
            skipped
          </p>
        </div>
      </header>

      {entries.length === 0 ? (
        <div
          className="border rounded-lg p-6 text-sm text-[var(--text-muted)]"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border)",
          }}
        >
          Empty. Add anomalies from today&apos;s digest using the &quot;Mark
          drafted&quot; button on each card.
        </div>
      ) : (
        <div
          className="border rounded-lg overflow-x-auto"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border)",
          }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs text-[var(--text-dim)] uppercase tracking-wider"
                style={{
                  borderBottom: "1px solid var(--border)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                <th className="py-2 px-4">Story</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...draft, ...shipped, ...skipped].map((e) => (
                <QueueRow key={e.id} entry={e} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- Panel: Top metros this week ----------

function ActivityPanel({
  digestDates,
  queue,
}: {
  digestDates: string[];
  queue: QueueEntry[];
}) {
  const recentlyShipped = queue
    .filter((e) => e.status === "shipped")
    .slice(0, 5);

  return (
    <section
      className="border rounded-lg p-5"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      <h2 className="text-lg font-bold mb-3">This week</h2>

      <div className="mb-5">
        <h3
          className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          Recently shipped
        </h3>
        {recentlyShipped.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Nothing shipped yet. Mark queue items as shipped after posting on
            Substack, LinkedIn, or Reddit.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentlyShipped.map((e) => (
              <li key={e.id} className="text-sm">
                <Link
                  href={`/rankings/${e.source.slug}`}
                  target="_blank"
                  className="hover:text-[var(--accent)]"
                >
                  {e.metroName}
                </Link>
                <span
                  className="text-xs text-[var(--text-dim)] ml-2"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  suppressHydrationWarning
                >
                  {fmtRelative(e.updatedAt)} · {e.channel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-5">
        <h3
          className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          Recent digests
        </h3>
        {digestDates.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No digests yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {digestDates.slice(0, 7).map((d) => (
              <li key={d}>
                <span
                  className="text-[var(--text-muted)]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {d}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3
          className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          Pageview leaderboard
        </h3>
        <p className="text-sm text-[var(--text-muted)]">
          GA4 isn&apos;t wired into the admin yet. Pull from{" "}
          <a
            href="https://analytics.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            Google Analytics
          </a>{" "}
          manually for now.
        </p>
      </div>
    </section>
  );
}

// ---------- Page ----------

export default async function MissionControlPage() {
  const digest = loadLatestDigest();
  const digestDates = listDigestDates();
  const queueFile = loadQueue();
  // Touch isAlreadyQueued so the import is not stripped when unused:
  void isAlreadyQueued;

  return (
    <main className="min-h-screen px-4 sm:px-6 lg:px-10 py-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-8 pb-6 border-b border-[var(--border)]">
          <div>
            <p
              className="text-xs tracking-widest text-[var(--text-muted)] mb-1"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              MISSION CONTROL · v0
            </p>
            <h1 className="text-3xl font-bold">Distribution console</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              View site &rarr;
            </Link>
            <form method="POST" action="/api/admin/logout">
              <button
                type="submit"
                className="text-xs px-2 py-1 rounded border"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-muted)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-12">
            <DigestPanel digest={digest} queue={queueFile.entries} />
            <QueuePanel entries={queueFile.entries} />
          </div>
          <aside>
            <ActivityPanel
              digestDates={digestDates}
              queue={queueFile.entries}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

#!/usr/bin/env node
/**
 * Release-notes gate — a shipping day may not close without an entry.
 *
 * Why this exists. On 2026-08-30 twenty commits touching app/, lib/ or public/
 * shipped across five sessions and none of them wrote a release note (a count
 * this gate produced itself, replaying that day); the newest entry on
 * /updates was the day before. One of those sessions had backfilled 08-23 and
 * 08-29 that same afternoon and still left the day it was working in blank.
 * The cause was not carelessness so much as invisibility: the discipline lived
 * only in a comment at the top of app/updates/page.tsx, so a session that never
 * opened that file never learned the step existed. Documentation is what
 * failed, so the fix is a gate rather than more documentation.
 *
 * WHAT COUNTS AS SHIPPING. A commit that touches app/, lib/ or public/ and does
 * NOT carry the [vercel skip] marker in its subject. That is deliberately the
 * same test the deploy discipline uses: if a commit was worth a production
 * build, it was worth a line telling readers what changed.
 *
 * THE RULE.
 *   - A shipping day EARLIER than today with no entry on or after it: FAIL.
 *     The day is closed and nobody can now remember what a reader would have
 *     noticed. This is the case that has to be loud.
 *   - A shipping day that IS today with no entry: WARN, not fail. Work in
 *     progress must not break `npm run verify` mid-afternoon; the note is
 *     expected in the commit that ships the work, and the day only becomes
 *     enforceable once it is over.
 *
 * SHALLOW CHECKOUTS. CI often clones with fetch-depth 1, which would leave this
 * gate with one commit of history and a confident wrong answer. It detects that
 * and exits 0 with a notice instead. A gate that cannot see is not a gate, and
 * it should say so rather than pass silently.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BUILD_RELEVANT_PATHS = ["app", "lib", "public"];
export const SKIP_MARKER = "[vercel skip]";

/** Every ISO date in lib/releases.ts, in file order. */
export function releaseDatesFrom(src) {
  return [...src.matchAll(/date:\s*"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
}

/**
 * The whole decision, as a pure function so the tests can drive it.
 * `commits` is [{ date: "YYYY-MM-DD", subject }]; `today` is "YYYY-MM-DD".
 * ISO dates compare correctly as strings, which is the one good reason to
 * keep them as strings all the way through rather than parsing to Date.
 */
export function auditReleaseNotes({ releaseDates, commits, today }) {
  if (!releaseDates.length) {
    return [{ level: "fail", date: null, subjects: [], reason: "lib/releases.ts has no entries at all." }];
  }
  const newest = releaseDates.slice().sort().at(-1);

  const byDay = new Map();
  for (const c of commits) {
    if (c.subject.includes(SKIP_MARKER)) continue; // not a production build, not a release
    if (c.date <= newest) continue;               // already covered by an entry
    if (!byDay.has(c.date)) byDay.set(c.date, []);
    byDay.get(c.date).push(c.subject);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, subjects]) => ({
      level: date < today ? "fail" : "warn",
      date,
      subjects,
      newest,
      reason:
        date < today
          ? `${date} shipped ${subjects.length} build-relevant commit(s) and closed with no entry (newest entry is ${newest}).`
          : `${date} has shipped ${subjects.length} build-relevant commit(s) so far with no entry yet (newest entry is ${newest}).`,
    }));
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");

  let shallow = "false";
  try {
    shallow = git(["rev-parse", "--is-shallow-repository"], root).trim();
  } catch {
    console.log("check:release-notes - SKIPPED (not a git checkout)");
    return;
  }
  if (shallow === "true") {
    console.log("check:release-notes - SKIPPED (shallow checkout: history is not visible, so this gate cannot judge)");
    return;
  }

  const releaseDates = releaseDatesFrom(readFileSync(join(root, "lib", "releases.ts"), "utf8"));
  const newest = releaseDates.slice().sort().at(-1) ?? "1970-01-01";

  // Two days of slack on --since (which filters committer date) so a rebase or
  // a cherry-pick cannot hide an author-dated commit just outside the window.
  const since = new Date(`${newest}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 2);

  const raw = git(
    ["log", `--since=${since.toISOString().slice(0, 10)}`, "--date=format:%Y-%m-%d",
     "--format=%ad\x1f%s", "--", ...BUILD_RELEVANT_PATHS],
    root,
  );
  const commits = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [date, ...rest] = line.split("\x1f");
      return { date, subject: rest.join("\x1f") };
    });

  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const findings = auditReleaseNotes({ releaseDates, commits, today });
  const fails = findings.filter((f) => f.level === "fail");
  const warns = findings.filter((f) => f.level === "warn");

  for (const f of findings) {
    console.log(`check:release-notes - ${f.level.toUpperCase()}: ${f.reason}`);
    for (const s of f.subjects.slice(0, 4)) console.log(`    ${s}`);
    if (f.subjects.length > 4) console.log(`    ...and ${f.subjects.length - 4} more`);
  }

  if (fails.length) {
    console.error("");
    console.error("RELEASE_NOTES_MISSING: add a date block to lib/releases.ts for each day above.");
    console.error("Rules (enforced at build time in app/updates/page.tsx): 4 bullets max, one short");
    console.error("sentence each, 220 chars, headline 4-8 words. See CLAUDE.md, Release notes.");
    process.exit(1);
  }
  if (warns.length) {
    console.log("check:release-notes - OK today, but write the note into the commit that ships the work.");
    return;
  }
  console.log(`check:release-notes - OK (${releaseDates.length} entries, newest ${newest})`);
}

// Run main() only when invoked as a script, never on import. Compared through
// pathToFileURL rather than by string match on the path, which is what once
// turned check:table-scroll into a silent no-op on Windows.
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) main();

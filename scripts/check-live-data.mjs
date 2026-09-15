/**
 * check:live-data - the guard for the "data that never deploys" bug class.
 *
 * THE BUG (found twice independently on 2026-08-07, from opposite ends):
 * a lib reads a public/data JSON with a build-time readFileSync, while a
 * scheduled job refreshes that JSON and commits it with [vercel skip]. The
 * commit is correct in isolation and the read is correct in isolation, but
 * together they mean the data is committed and NEVER reaches a reader until
 * some unrelated build happens to land. It fails silently: no error, no
 * warning, no staleness alert, just old numbers on the page.
 *
 * It had already been fixed twice by hand - lib/powerRanking.ts and
 * lib/screen.ts - and each fix was applied to one file while four other
 * verticals stayed broken for months. Detection existed only by luck: the
 * mini's post-commit hook happened to flag a MISMATCH on a real rugby run.
 * This is the static version of that check, so the next vertical cannot
 * quietly reintroduce it.
 *
 * THE RULE: every path in OUT_OF_BAND below must be loaded at RUNTIME by its
 * owning lib - either through loadLiveJson() from lib/liveData, or through a
 * direct raw.githubusercontent fetch (the older hand-rolled form). A lib that
 * only ever reaches its out-of-band data through readFileSync fails this check.
 *
 * WHEN YOU ADD A SCHEDULED REFRESH: add its output paths here at the same time.
 * The bottom half of this script tries to catch you if you forget, by scanning
 * the refresh scripts for public/data paths that are not declared.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Data refreshed by a scheduled job that commits with [vercel skip]. */
const OUT_OF_BAND = [
  {
    lib: "lib/sound.ts",
    paths: ["sound/metros_unified.json", "sound/metro_number_ones.json"],
    refreshedBy: "mac-mini-jobs/run-sound-weekly.sh",
  },
  {
    lib: "lib/screen.ts",
    paths: ["screen/screen_number_ones.json"],
    refreshedBy: "mac-mini-jobs/run-screen-number-ones.sh",
  },
  {
    lib: "lib/powerRanking.ts",
    paths: ["power-ranking.json"],
    refreshedBy: "the weekly power-ranking refresh",
  },
  // Converted 2026-08-07. No pending flags remain: every path below is now
  // enforced, so a regression to readFileSync fails CI rather than being noted.
  {
    lib: "lib/rugbyUnion.ts",
    paths: ["rugby-union/teams.json", "rugby-union/hub.json"],
    refreshedBy: "mac-mini-jobs/run-scraper-refresh.sh rugby",
  },
  {
    lib: "lib/cricket.ts",
    paths: ["cricket/teams.json", "cricket/hub.json"],
    refreshedBy: "mac-mini-jobs/run-cricket-weekly.sh",
  },
  {
    lib: "lib/basketball.ts",
    paths: ["basketball/nations.json", "basketball/hub.json"],
    refreshedBy: "mac-mini-jobs/run-scraper-refresh.sh fiba",
  },
  {
    lib: "lib/wbasketball.ts",
    paths: ["wbasketball/nations.json", "wbasketball/hub.json",
            "wbasketball/fiba_ranking.json"],
    refreshedBy: ".github/workflows/wwc-2026-tracker.yml (and the weekly "
      + "women's FIBA ranking refresh)",
  },
  {
    lib: "lib/refreshSchedule.ts",
    paths: ["refresh-schedule.json"],
    refreshedBy: "mac-mini-jobs/export_schedule.py (run after every dispatcher tick, not a jobs.toml entry)",
  },
  {
    lib: "lib/teamOwners.ts",
    paths: ["owners/team-owners.json"],
    refreshedBy: "mac-mini-jobs/run-owners-weekly.sh (Mondays 08:30 UTC)",
  },
  {
    lib: "lib/majors.ts",
    paths: ["majors/golf.json", "majors/tennis.json"],
    refreshedBy: ".github/workflows/majors-ingest.yml (05:30 UTC daily)",
  },
  {
    lib: "lib/championsCurrent.ts",
    paths: ["champions-current.json"],
    refreshedBy:
      ".github/workflows/majors-ingest.yml (05:30 UTC daily) and footy-refresh.yml "
      + "(the AFL/NRL finalizer); emitted by scripts/champions/build_champions.py",
  },
];

/** Deliberate exemptions, each with the reason it is safe. */
const EXEMPT = [
  {
    lib: "lib/quiz.ts",
    reason:
      "quiz_queue.json is read with readFileSync, but lib/quiz.ts is imported by " +
      "NOTHING - a repo-wide search returns only a stale tsbuildinfo entry - so no " +
      "route renders it and the skip tag is harmless. THIS EXEMPTION EXPIRES the " +
      "moment any route imports lib/quiz.ts; convert it in the same change.",
  },
  {
    lib: "public/data/leaders/**",
    reason:
      "Solved the other way: pinned as a build path in scripts/vercel-ignore.sh " +
      "with a regression case in scripts/test-vercel-ignore.sh, and its refresh " +
      "commits deliberately omit the skip tag, so it gets a real deploy.",
  },
];

/**
 * Paths the drift scan surfaces that were CHECKED on 2026-08-07 and are fine.
 * Recorded so the next reader does not redo the analysis. Re-check if the
 * owning lib changes.
 */
const CHECKED_BENIGN = {
  "activity-feed": "lib/activity.ts already fetches raw with ISR (mirrors lib/screen.ts)",
  conflicts: "lib/conflicts.ts already fetches raw with ISR; getConflicts is async",
  conflicts_raw: "no lib reads it; it is an intermediate build artefact",
  "citypopulation-feed": "no lib reads it",
  forecast: "lib/forecast.ts, lib/nflSim.ts and lib/plSim.ts all already fetch raw with ISR",
  f1: "lib/f1.ts reads workbook-built data; the live half is lib/f1Standings.ts at request time",
  football:
    "the skip-tagging writers here are euro-comps hub-*.json and football-standings, " +
    "both already runtime-read. The other football libs read workbook-built data that " +
    "only changes on a real ETL, so a build is expected",
  "substack-feed": "lib/substack.ts fetches the live feed and uses the file only as fallback",
  leaders: "solved the other way, see EXEMPT below",
};

let failures = 0;
let pendingCount = 0;

console.log("check:live-data - out-of-band data must be read at runtime\n");

for (const entry of OUT_OF_BAND) {
  const abs = join(REPO_ROOT, entry.lib);
  if (!existsSync(abs)) {
    console.error(`  FAIL  ${entry.lib} does not exist (stale entry in this script?)`);
    failures++;
    continue;
  }
  const src = readFileSync(abs, "utf-8");
  for (const p of entry.paths) {
    // Runtime evidence: loadLiveJson("<path>") or a raw.githubusercontent URL
    // ending in that path. Both are accepted; the second is the older
    // hand-rolled form in powerRanking.ts and screen.ts.
    const viaHelper = src.includes(`loadLiveJson<`) && src.includes(`"${p}"`) ||
      src.includes(`loadLiveJson<`) && src.includes(`'${p}'`);
    const viaRawUrl = src.includes("raw.githubusercontent.com") && src.includes(p.split("/").pop());
    const ok = viaHelper || viaRawUrl;

    if (ok) {
      console.log(`  ok    ${entry.lib.padEnd(24)} ${p}`);
    } else if (entry.pending) {
      console.log(`  PEND  ${entry.lib.padEnd(24)} ${p}  (known, refreshed by ${entry.refreshedBy})`);
      pendingCount++;
    } else {
      console.error(
        `  FAIL  ${entry.lib} reads ${p} at build time, but ${entry.refreshedBy}\n` +
        `        refreshes it with [vercel skip]. That data will never reach a reader.\n` +
        `        Fix: load it through loadLiveJson() from lib/liveData.`,
      );
      failures++;
    }
  }
}

// --- manifest drift: refresh scripts writing public/data paths we do not declare
const SCRIPT_DIR = join(REPO_ROOT, "mac-mini-jobs");
const declared = new Set(OUT_OF_BAND.flatMap((e) => e.paths.map((p) => p.split("/")[0])));
const undeclared = new Set();
if (existsSync(SCRIPT_DIR)) {
  for (const f of readdirSync(SCRIPT_DIR).filter((f) => f.endsWith(".sh"))) {
    const src = readFileSync(join(SCRIPT_DIR, f), "utf-8");
    if (!src.includes("[vercel skip]")) continue;
    for (const m of src.matchAll(/public\/data\/([A-Za-z0-9_-]+)/g)) {
      if (!declared.has(m[1]) && !(m[1] in CHECKED_BENIGN)) {
        undeclared.add(`${m[1]}  (referenced by mac-mini-jobs/${f})`);
      }
    }
  }
}
if (undeclared.size) {
  console.log("\n  note: skip-tagging refresh scripts touch these undeclared public/data paths.");
  console.log("  Each is only a problem if a lib reads it at build time. Check, then declare or ignore:");
  for (const u of [...undeclared].sort()) console.log(`    - ${u}`);
}

// --- the same bug the other way round: a job that writes a RUNTIME-READ path
// and commits WITHOUT [vercel skip], so a data-only change buys a full paid
// production build that publishes nothing the runtime read would not have
// fetched by itself.
//
// This is not hypothetical. majors-ingest.yml omitted the tag deliberately and
// documented why: the golf/tennis hubs and the champions board baked their JSON
// in, so the build WAS the publishing mechanism. Once those three files moved to
// a runtime read (2026-09-15) the omission became pure waste, and nothing in the
// repo would have noticed. 6871c2a9d, the US Open champions, is the last one it
// cost: three changed lines, one Turbo build, and one of the two daily slots
// scripts/vercel-ignore.sh allows, spent at 05:30 UTC by a bot.
//
// The rule: once a path is declared above, every job that writes it must tag the
// commit. Add to WASTE_EXEMPT only for a job whose commit genuinely has to build
// something else in the same change, and say what.
const WASTE_EXEMPT = [];
const declaredFull = OUT_OF_BAND.flatMap((e) => e.paths);
const WRITER_DIRS = [join(REPO_ROOT, ".github", "workflows"), SCRIPT_DIR];
let waste = 0;

for (const dir of WRITER_DIRS) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => /\.(ya?ml|sh)$/.test(f))) {
    const rel = `${dir.endsWith("workflows") ? ".github/workflows" : "mac-mini-jobs"}/${f}`;
    if (WASTE_EXEMPT.some((e) => e.file === rel)) continue;
    const src = readFileSync(join(dir, f), "utf-8");
    const writes = declaredFull.filter((p) => src.includes(`public/data/${p}`));
    if (!writes.length) continue;
    // Every commit subject this file creates. A tag on the subject is what
    // vercel-ignore.sh reads, so that is what is checked.
    for (const m of src.matchAll(/git commit\s+(?:-a\s+)?-m\s+(["'])([^"']*)\1/g)) {
      const subject = m[2];
      // A $VAR subject is assembled above the commit; those branches are
      // checked as literals elsewhere in the same file, so skip the indirection.
      if (/^\$/.test(subject.trim())) continue;
      if (subject.includes("[vercel skip]") || subject.includes("[deploy-")) continue;
      console.error(
        `\n  FAIL  ${rel} commits "${subject}"\n` +
        `        without [vercel skip], but it writes ${writes.join(", ")},\n` +
        `        which ${writes.length > 1 ? "are" : "is"} read at RUNTIME. That commit spends a paid\n` +
        `        production build to publish data the ISR fetch already carries.\n` +
        `        Fix: add [vercel skip] to the subject and ping /api/revalidate.`,
      );
      waste++;
    }
  }
}

console.log(`\n  exemptions on file: ${EXEMPT.length}`);
for (const e of EXEMPT) console.log(`    - ${e.lib}`);

if (failures || waste) {
  const parts = [];
  if (failures) parts.push(`${failures} never-deploys problem(s)`);
  if (waste) parts.push(`${waste} wasted-build problem(s)`);
  console.error(`\ncheck:live-data FAILED (${parts.join(", ")})`);
  process.exit(1);
}
console.log(
  `\ncheck:live-data OK` +
  (pendingCount ? ` (${pendingCount} known-pending conversion(s) - see OUT_OF_BAND pending flags)` : ""),
);

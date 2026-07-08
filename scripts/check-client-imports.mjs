#!/usr/bin/env node
/**
 * Static guard for the server/client module boundary.
 *
 * Vercel keeps failing on errors `tsc --noEmit` misses because tsc accepts
 * `fs` and `path` in any file (devDeps include @types/node) — but Turbopack
 * at build time refuses those modules in the client bundle. The bug pattern
 * is always the same: a `"use client"` file imports a VALUE (not just a
 * type) from a module that uses Node fs.
 *
 * This script scans every `"use client"` file in app/ and components/ and
 * fails if it value-imports from a known server-only module. Pure
 * `import type` lines are fine — they get erased at compile time.
 *
 * Run as `npm run check:client-imports` or `npm run verify`.
 *
 * Maintenance: when you add a new server-only lib (uses fs/path), add its
 * @/lib path to SERVER_ONLY_MODULES below AND add `import "server-only";`
 * to the top of that file. The server-only directive is the runtime guard;
 * this script is the pre-push guard.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const SERVER_ONLY_MODULES = [
  "@/lib/cws",
  "@/lib/allTeams",
  "@/lib/audience",
  "@/lib/wcbb",
  "@/lib/collegeHockey",
  "@/lib/champions",
  "@/lib/championsHub",
  "@/lib/championsHistory",
  "@/lib/nfl",
  "@/lib/mlb",
  "@/lib/nba",
  "@/lib/football",
  "@/lib/domesticFootball",
  "@/lib/international",
  "@/lib/nationalTeamsForCountry",
  "@/lib/badges",
  "@/lib/substack",
  "@/lib/data",
  "@/lib/teamLinks",
  "@/lib/wfootball",
  "@/lib/wnational",
  "@/lib/wnba",
  "@/lib/wnba-standings",
  "@/lib/nwsl-standings",
  "@/lib/mls-standings",
  "@/lib/standings",
  "@/lib/rugbyFixtures",
  "@/lib/cricketFixtures",
  "@/lib/mlb-standings",
  "@/lib/nba-standings",
  "@/lib/nhl",
  "@/lib/nhl-standings",
  "@/lib/cricket",
  "@/lib/rugbyUnion",
  "@/lib/wc2026Standings",
  "@/lib/euroComps",
  "@/lib/baseball",
  "@/lib/olympics",
  "@/lib/rugbyClubs",
  "@/lib/cricketClubs",
  "@/lib/basketball",
  "@/lib/hockey",
  "@/lib/majors",
  "@/lib/npb",
  "@/lib/worldsPortal",
  "@/lib/handball",
  "@/lib/volleyball",
  "@/lib/honourRolls",
  "@/lib/rivalries",
  "@/lib/belowTheLine",
  "@/lib/rugbyLeagueIntl",
  "@/lib/wintl",
  "@/lib/domesticHonours",
  "@/lib/leadersAll",
];

const SCAN_DIRS = ["app", "components"];
const TSX_EXTS = new Set([".ts", ".tsx", ".jsx"]);

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
      out.push(...walk(full));
    } else if (st.isFile() && TSX_EXTS.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

function isClientFile(src) {
  const head = src.split(/\r?\n/, 20).join("\n");
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use client['"]/m.test(head);
}

function findForbiddenImports(src) {
  const issues = [];
  const importRe = /^\s*import\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]\s*;?$/gm;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const clause = m[1].trim();
    const source = m[2];
    if (!SERVER_ONLY_MODULES.includes(source)) continue;
    if (/^type\s/.test(clause)) continue;
    if (/^\{[^}]*\}$/.test(clause)) {
      const inner = clause.slice(1, -1);
      const parts = inner.split(",").map((s) => s.trim()).filter(Boolean);
      const allTyped = parts.length > 0 && parts.every((p) => /^type\s/.test(p));
      if (allTyped) continue;
    }
    issues.push({ clause, source, line: src.slice(0, m.index).split("\n").length });
  }
  const bareRe = /^\s*import\s+['"]([^'"]+)['"]\s*;?$/gm;
  while ((m = bareRe.exec(src)) !== null) {
    const source = m[1];
    if (SERVER_ONLY_MODULES.includes(source)) {
      issues.push({ clause: "(side-effect)", source, line: src.slice(0, m.index).split("\n").length });
    }
  }
  return issues;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));
const violations = [];
let clientCount = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!isClientFile(src)) continue;
  clientCount++;
  const issues = findForbiddenImports(src);
  for (const issue of issues) {
    violations.push({ file: relative(REPO_ROOT, file).split(sep).join("/"), ...issue });
  }
}

if (violations.length === 0) {
  console.log("check:client-imports - OK (" + files.length + " files scanned, " + clientCount + " use-client files)");
  process.exit(0);
}

console.error("");
console.error("check:client-imports - FAIL");
console.error("");
console.error("These use-client files import a VALUE from a server-only module.");
console.error("That pulls fs into the client bundle and breaks the Next.js build.");
console.error("Fix: move the value to a client-safe module, inline it, or use 'import type'.");
console.error("");
for (const v of violations) {
  console.error("  " + v.file + ":" + v.line);
  console.error("    imports " + v.clause + " from " + v.source);
}
console.error("");
process.exit(1);

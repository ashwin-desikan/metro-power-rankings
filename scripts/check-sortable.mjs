#!/usr/bin/env node
// check:sortable — every ranked board is sortable, on both surfaces.
//
// DESIGN-STANDARDS §4 (added 2026-09-10): a table with a heading row of
// five or more columns is a board, and a board sorts on every value column
// on the desktop table (click the heading) AND on the phone list (a sort
// control), which is what `app/_shared/SortableBoard.tsx` provides. Ashwin,
// after the fourth new board in a week shipped with a fixed order: "When
// you build tables, they always need to be sortable, right? They also need
// to have contingencies for desktop and mobile. I don't want to have to
// keep repeating this."
//
// What this checks, per `<table` in app/**/*.tsx:
//   - count the `<th` inside its `<thead>`; fewer than 5 is not a board;
//   - a board is fine when the file is SortableBoard.tsx itself, or the
//     `<table` tag carries `data-static-sort="<reason>"` (a fixture list,
//     a key/value board, a table whose order IS the content);
//   - anything else is a finding. Findings in scripts/sortable-baseline.json
//     are tolerated (the ratchet): fix a file and remove it from the
//     baseline; never add to it.
//
// Usage: node scripts/check-sortable.mjs [--write-baseline]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "scripts", "sortable-baseline.json");
const MIN_COLS = 5;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

export function findBoards(src) {
  // Returns one entry per <table ...> whose thead has >= MIN_COLS <th and no data-static-sort.
  const out = [];
  const re = /<table\b([^>]*)>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1];
    const from = m.index;
    const close = src.indexOf("</table>", from);
    const body = src.slice(from, close === -1 ? undefined : close);
    const headEnd = body.indexOf("</thead>");
    if (headEnd === -1) continue;                       // headerless: not a board
    const head = body.slice(0, headEnd);
    const ths = (head.match(/<th\b/g) || []).length;
    // A mapped heading (`{cols.map(... <th`)`) counts as many: treat `.map(` inside thead as a board.
    const mapped = /\.map\(/.test(head);
    if (ths < MIN_COLS && !mapped) continue;
    if (/data-static-sort=/.test(attrs)) continue;
    const line = src.slice(0, from).split("\n").length;
    out.push({ line, ths, mapped });
  }
  return out;
}

function main() {
  const writeBaseline = process.argv.includes("--write-baseline");
  const files = walk(path.join(ROOT, "app"));
  const findings = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    if (rel.endsWith("app/_shared/SortableBoard.tsx")) continue;
    const src = fs.readFileSync(f, "utf8");
    for (const b of findBoards(src)) findings.push(`${rel}:${b.line}`);
  }
  const keys = findings.map((f) => f.replace(/:\d+$/, ""));
  const perFile = {};
  for (const k of keys) perFile[k] = (perFile[k] || 0) + 1;
  if (writeBaseline) {
    fs.writeFileSync(BASELINE, JSON.stringify(perFile, null, 2) + "\n");
    console.log(`check:sortable - baseline written: ${Object.keys(perFile).length} files, ${findings.length} boards`);
    return 0;
  }
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
  let bad = 0;
  for (const [file, n] of Object.entries(perFile)) {
    const allowed = baseline[file] || 0;
    if (n > allowed) {
      bad++;
      console.error(`SORTABLE_VIOLATION ${file}: ${n} fixed-order board(s) with ${MIN_COLS}+ columns (baseline ${allowed}). Use app/_shared/SortableBoard, or mark the <table> data-static-sort="reason".`);
    }
  }
  const stale = Object.keys(baseline).filter((f) => !(f in perFile));
  if (bad) {
    console.error(`check:sortable - ${bad} file(s) over baseline`);
    return 1;
  }
  console.log(`check:sortable - OK (${files.length} files scanned, ${findings.length} baselined boards in ${Object.keys(perFile).length} files${stale.length ? `; ${stale.length} baseline entries now clean, shrink the baseline` : ""})`);
  return 0;
}

if (process.argv[1] && /check-sortable\.mjs$/.test(process.argv[1])) process.exit(main());

#!/usr/bin/env node
/**
 * Static mobile gate — the standing enforcement for DESIGN-STANDARDS.md's
 * mobile rules, alongside check:table-scroll (which owns tables specifically).
 *
 * Why a second gate. check:table-scroll proved that a <table> can reach a
 * phone with a scroll box and a pinned identity column. It says nothing
 * about the OTHER half of every responsive board on this site: the
 * `sm:hidden` card list rendered beside that table. That list is not a
 * table, so it inherits none of the globals.css containment, and it is
 * where every measured mobile failure has actually lived:
 *
 *   /leaders    29.3 phone screens vs 1.6 on desktop  (18.0x)
 *   /teams/national  50.4 vs 4.3                      (11.7x)
 *   /mayors     13.2 vs 1.2                           (10.8x)
 *   /power      16.6 vs 1.6                           (10.1x)
 *
 * — all measured at 390px on 2026-08-30, all passing every gate that
 * existed at the time. The rules below are those failures, generalised.
 *
 * RULES
 *  1 UNCAPPED_MOBILE_LIST  a `sm:hidden`/`md:hidden` block that renders a
 *      list (.map) with no length cap. Wrap it in <CappedList> (or give it
 *      an explicit max-h + overflow-y-auto where a scroll box genuinely
 *      suits). app/_shared/Disclosure.tsx.
 *  2 GRID_CHILD_NO_MIN_W_0  a flex/grid child holding a table without
 *      `min-w-0`. Grid items default to `min-width: auto`, so the table
 *      inflates its track and the WHOLE PAGE scrolls sideways.
 *  3 RIGID_WIDE_GRID  `grid-cols-4`+ with no responsive prefix — four
 *      columns in 390px is four unreadable columns.
 *  4 HARD_WIDTH  a fixed `w-[NNNpx]` / `min-w-[NNNpx]` wider than a phone
 *      with no `max-w-full` to let it back down.
 *  5 NAV_CLEARANCE  `pt-16`+ at the top of a page. SiteNav is `sticky`, not
 *      `fixed`; it owns its own space, and clearance padding is dead
 *      vertical room on the viewport that has least of it.
 *  6 NOWRAP_LIST_NO_SCROLL  a rendered list forced `whitespace-nowrap`
 *      with no horizontal scroll container to hold it.
 *
 * RATCHET. scripts/mobile-baseline.json freezes the per-file, per-rule
 * offender counts that existed when this gate landed. A file may never
 * exceed its baseline, so every new or edited component must comply while
 * the legacy tail stays shippable. Regenerate with --write-baseline ONLY
 * after fixing files, to shrink it. Growing the baseline to make the gate
 * pass defeats the gate; fix the component instead.
 *
 * Run: npm run check:mobile   (also part of npm run verify)
 */

import ts from "typescript";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BASELINE_PATH = join(__dirname, "mobile-baseline.json");
const SCAN_DIRS = ["app"];
const EXTS = new Set([".tsx", ".jsx"]);

/** Components that already own a length cap for their mobile list. */
const CAPPING_TAGS = new Set(["CappedList", "ShowMore", "ResponsiveTable", "Disclosure"]);

const RULES = {
  UNCAPPED_MOBILE_LIST:
    "mobile-only list with no length cap — wrap it in <CappedList> from app/_shared/Disclosure",
  GRID_CHILD_NO_MIN_W_0:
    "flex/grid child holding a table needs min-w-0, or the table drags the page sideways",
  RIGID_WIDE_GRID: "grid-cols-4+ with no responsive prefix — collapse it on phones",
  HARD_WIDTH: "fixed width wider than a phone with no max-w-full to fall back to",
  NAV_CLEARANCE: "nav-clearance padding — SiteNav is sticky and owns its own space",
  NOWRAP_LIST_NO_SCROLL: "nowrap list with no overflow-x-auto container to scroll in",
};

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
      out.push(...walk(full));
    } else if (st.isFile() && EXTS.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

function tagName(node) {
  const t = node.tagName;
  if (!t) return null;
  if (ts.isIdentifier(t) || ts.isPropertyAccessExpression(t)) return t.getText();
  return null;
}

/**
 * All class tokens an element could carry, including the branches of a
 * template literal or ternary — a conditional `min-w-0` still counts as
 * the author having thought about it.
 */
function classOf(open) {
  if (!open.attributes) return "";
  let cls = "";
  for (const a of open.attributes.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== "className") continue;
    const init = a.initializer;
    if (!init) continue;
    if (ts.isStringLiteral(init)) cls += " " + init.text;
    else if (ts.isJsxExpression(init) && init.expression) cls += " " + init.expression.getText();
  }
  return cls;
}

function hasAttr(open, name) {
  return (open.attributes?.properties ?? []).some(
    (a) => ts.isJsxAttribute(a) && a.name.getText() === name
  );
}

/**
 * Does this subtree render a repeated list of CONTENT?
 *
 * A `.map` over <option>s is a form control the OS renders in its own
 * picker, and a `.map` inside a <select> or <nav> is navigation — neither
 * is page-length, so neither is this rule's business.
 */
function rendersList(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    const tag =
      ts.isJsxElement(n) ? tagName(n.openingElement) : ts.isJsxSelfClosingElement(n) ? tagName(n) : null;
    if (tag === "select" || tag === "nav" || tag === "option") return; // don't descend
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "map"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function containsTable(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    const tag =
      ts.isJsxElement(n) ? tagName(n.openingElement) : ts.isJsxSelfClosingElement(n) ? tagName(n) : null;
    // Components that render a <table> internally count as one here: the
    // grid item still has to be allowed to shrink around them.
    if (
      tag === "table" ||
      tag === "TableScroll" ||
      tag === "ResponsiveTable" ||
      tag === "TableBox" ||
      tag === "SortableTable"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

/** Does a capping component appear anywhere under this node? */
function hasCap(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    const tag =
      ts.isJsxElement(n) ? tagName(n.openingElement) : ts.isJsxSelfClosingElement(n) ? tagName(n) : null;
    if (tag && CAPPING_TAGS.has(tag)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

export function checkFile(src, filename) {
  const out = [];
  const kind = filename.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true, kind);

  const add = (rule, node, detail) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ rule, line: line + 1, detail });
  };

  // `scrolled` tracks whether an ancestor already provides a horizontal
  // scroll box. Inside one, a deliberate min-width is the point (a pipeline
  // diagram, a wide table) rather than page overflow.
  const visit = (n, scrolled = false) => {
    const isEl = ts.isJsxElement(n);
    const isSelf = ts.isJsxSelfClosingElement(n);
    if (isEl || isSelf) {
      const open = isEl ? n.openingElement : n;
      const cls = classOf(open);
      const tag = tagName(open);

      // 1 — mobile-only list with no cap.
      //
      // Tokenised, not regexed: `\bhidden\s+(sm|md):` matched the substring
      // inside "overflow-hidden sm:hidden" (a `-` is a word boundary), which
      // silently exempted /sports/zone-zero-cup — 30.9 phone screens against
      // 2.2 on desktop, found by the probe on 2026-08-30 while this gate
      // reported clean. Compare whole utility tokens.
      const toks = new Set(cls.split(/[\s"'`]+/).filter(Boolean));
      const mobileOnly = (toks.has("sm:hidden") || toks.has("md:hidden")) && !toks.has("hidden");
      if (isEl && mobileOnly) {
        const capped =
          /max-h-/.test(cls) || /overflow-y-auto/.test(cls) || hasAttr(open, "data-mobile-uncapped");
        if (!capped && rendersList(n) && !hasCap(n)) {
          add("UNCAPPED_MOBILE_LIST", open, cls.trim().slice(0, 80));
        }
      }

      // 2 — grid/flex child holding a table without min-w-0.
      if (isEl && /\bgrid\b|\bflex\b/.test(cls)) {
        for (const child of n.children) {
          if (!ts.isJsxElement(child)) continue;
          const ctag = tagName(child.openingElement) ?? "";
          // Host elements only. A custom component owns its own root
          // className, so the fix belongs in the component, not here, and
          // flagging the call site sends the author to the wrong file.
          if (!/^[a-z]/.test(ctag)) continue;
          const ccls = classOf(child.openingElement);
          if (containsTable(child) && !/min-w-0/.test(ccls)) {
            add("GRID_CHILD_NO_MIN_W_0", child.openingElement, ccls.trim().slice(0, 70));
          }
        }
      }

      // 3 — rigid wide grid.
      const gm = cls.match(/(?:^|\s)grid-cols-([4-9]|1[0-2])\b/);
      if (gm && !/\b(sm|md|lg|xl|2xl):grid-cols-/.test(cls)) {
        add("RIGID_WIDE_GRID", open, gm[0].trim());
      }

      // 4 — hard width wider than a phone. A <table> is exempt: it lives in
      // a TableScroll box by construction (check:table-scroll proves it), so
      // a min-width there is a deliberate column floor, not page overflow.
      const wm = cls.match(/(?:^|\s)(?:min-)?w-\[(\d+)px\]/);
      if (wm && !scrolled && tag !== "table" && Number(wm[1]) > 360 && !/max-w-full/.test(cls)) {
        add("HARD_WIDTH", open, wm[0].trim());
      }

      // 5 — nav-clearance padding at page top.
      const pm = cls.match(/(?:^|\s)pt-(1[6-9]|2\d|3\d)\b/);
      if (pm && (tag === "main" || tag === "div") && !/\b(sm|md|lg):pt-/.test(cls)) {
        add("NAV_CLEARANCE", open, pm[0].trim());
      }

      // 6 — nowrap list with nowhere to scroll. Table internals are exempt:
      // check:table-scroll already proves every <table> sits in a scroll box,
      // so nowrap there is a deliberate column-width choice, not an overflow.
      const TABLE_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr", "td", "th"]);
      if (
        isEl &&
        !TABLE_TAGS.has(tag ?? "") &&
        /whitespace-nowrap/.test(cls) &&
        rendersList(n) &&
        !/overflow-x-auto|overflow-auto/.test(cls)
      ) {
        add("NOWRAP_LIST_NO_SCROLL", open, cls.trim().slice(0, 70));
      }
      const nowScrolled =
        scrolled || /overflow-x-auto|overflow-auto|overflow-x-scroll/.test(cls);
      ts.forEachChild(n, (c) => visit(c, nowScrolled));
      return;
    }
    ts.forEachChild(n, (c) => visit(c, scrolled));
  };
  visit(sf);
  return out;
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));
  /** @type {Map<string, Record<string, number>>} */
  const byFile = new Map();
  /** @type {Map<string, Array<{rule:string,line:number,detail:string}>>} */
  const detailByFile = new Map();

  for (const file of files) {
    const rel = relative(REPO_ROOT, file).split(sep).join("/");
    const found = checkFile(readFileSync(file, "utf8"), file);
    if (!found.length) continue;
    const counts = {};
    for (const f of found) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
    byFile.set(rel, counts);
    detailByFile.set(rel, found);
  }

  if (process.argv.includes("--list")) {
    // Every finding, baseline ignored — for working through the tail.
    for (const [rel, found] of detailByFile) {
      for (const d of found) console.log(`${d.rule}\t${rel}:${d.line}\t${d.detail}`);
    }
    return;
  }

  if (process.argv.includes("--write-baseline")) {
    const obj = {};
    for (const f of [...byFile.keys()].sort()) obj[f] = byFile.get(f);
    writeFileSync(BASELINE_PATH, JSON.stringify(obj, null, 2) + "\n");
    const total = [...byFile.values()].reduce(
      (s, c) => s + Object.values(c).reduce((a, b) => a + b, 0),
      0
    );
    console.log(`check:mobile - wrote baseline (${byFile.size} files, ${total} findings)`);
    return;
  }

  let baseline = {};
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    /* first run */
  }

  const violations = [];
  for (const [rel, counts] of byFile) {
    const allowed = baseline[rel] ?? {};
    for (const [rule, n] of Object.entries(counts)) {
      if (n > (allowed[rule] ?? 0)) {
        for (const d of detailByFile.get(rel).filter((x) => x.rule === rule)) {
          violations.push({ file: rel, ...d, allowed: allowed[rule] ?? 0, found: n });
        }
      }
    }
  }

  // Report a baseline entry that no longer has any offenders, so the ratchet
  // actually tightens instead of quietly preserving fixed files forever.
  const stale = Object.keys(baseline).filter((f) => !byFile.has(f));

  if (violations.length) {
    console.error("");
    console.error("check:mobile - FAIL");
    console.error("");
    const byRule = new Map();
    for (const v of violations) {
      if (!byRule.has(v.rule)) byRule.set(v.rule, []);
      byRule.get(v.rule).push(v);
    }
    for (const [rule, vs] of byRule) {
      console.error(`${rule} — ${RULES[rule]}`);
      for (const v of vs.slice(0, 12)) {
        console.error(`  ${v.file}:${v.line}  ${v.detail}`);
      }
      if (vs.length > 12) console.error(`  ... and ${vs.length - 12} more`);
      console.error("");
    }
    console.error("See DESIGN-STANDARDS.md. If a finding is genuinely intentional, say so in");
    console.error("code (an explicit max-h, or data-mobile-uncapped on the container) rather");
    console.error("than growing scripts/mobile-baseline.json.");
    process.exit(1);
  }

  const total = [...byFile.values()].reduce(
    (s, c) => s + Object.values(c).reduce((a, b) => a + b, 0),
    0
  );
  console.log(
    `check:mobile - OK (${files.length} files scanned, ${total} baselined findings in ${byFile.size} files)`
  );
  if (stale.length) {
    console.log(
      `check:mobile - ${stale.length} baselined file${stale.length === 1 ? " is" : "s are"} now clean; shrink the ratchet with:`
    );
    console.log("  node scripts/check-mobile.mjs --write-baseline");
  }
}

// Run main() only when invoked as a script. Guarded against a missing
// argv[1] (`node -e`, a test importer) so importing this module can never
// crash — and written as an explicit comparison rather than a string match
// on the path, which is what silently turned check:table-scroll into a
// no-op on Windows once. A gate that prints nothing is a broken gate.
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) main();

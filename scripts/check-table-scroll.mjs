#!/usr/bin/env node
/**
 * Static guard: every <table> in app/ must be a direct JSX child of one of
 * the shared scroll-wrapper components (<TableScroll>, app/_shared/TableScroll.tsx;
 * or <ResponsiveTable>, app/teams/_shared/ResponsiveTable.tsx, which wraps its
 * <table> child in <TableScroll> internally) or an element carrying
 * overflow-x-auto / overflow-auto / overflow-hidden (via className or an
 * inline style overflowX/overflow), matching the sitewide
 * `.overflow-x-auto:has(> table)` rule in app/globals.css that gives tables
 * their scroll container, sticky header, and (under 640px) sticky first
 * column and touch scrolling.
 *
 * That CSS rule only matches when <table> is a DIRECT child of the scroll
 * element, so a table nested one level deeper than its wrapper silently
 * loses all of that with no visual warning until someone hits it on a
 * phone. This script parses the real JSX tree (not a regex) so it can't be
 * fooled the same way the CSS selector can.
 *
 * Escape hatch: add `data-no-scroll-check` to the <table> for a table that
 * intentionally never needs horizontal scroll (e.g. always-narrow 2-column
 * key/value tables).
 *
 * Run as `npm run check:table-scroll` or `npm run verify`.
 */

import ts from "typescript";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const SCAN_DIRS = ["app"];
const EXTS = new Set([".tsx", ".jsx"]);
const OVERFLOW_CLASSES = ["overflow-x-auto", "overflow-auto", "overflow-hidden"];
// Components that guarantee their <table> child renders inside a
// TableScroll-equivalent scroll container, so a literal <TableScroll>
// ancestor isn't required.
const SCROLL_WRAPPER_TAGS = new Set(["TableScroll", "ResponsiveTable"]);

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
    } else if (st.isFile() && EXTS.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Climb past JS expression wrappers that don't add a DOM node of their own
 * (ternaries, parens, &&/||, and the {…} JSX-expression container) to find
 * the nearest ancestor that's an actual rendered element: a JsxElement, a
 * JsxFragment, or neither (component root / unexpected position).
 */
function findRenderedParent(node) {
  let cur = node.parent;
  while (
    cur &&
    (ts.isParenthesizedExpression(cur) ||
      ts.isConditionalExpression(cur) ||
      ts.isBinaryExpression(cur) ||
      ts.isJsxExpression(cur))
  ) {
    cur = cur.parent;
  }
  return cur;
}

function jsxTagName(openingLike) {
  const tag = openingLike.tagName;
  return tag && ts.isIdentifier(tag) ? tag.text : undefined;
}

function findAttribute(attributes, name) {
  return attributes.properties.find(
    (p) => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === name
  );
}

function hasNoScrollCheckEscape(attributes) {
  return attributes.properties.some(
    (p) => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "data-no-scroll-check"
  );
}

function attributeQualifies(openingElement, sourceFile) {
  const attrs = openingElement.attributes;
  const classNameAttr = findAttribute(attrs, "className");
  if (classNameAttr) {
    const text = classNameAttr.getText(sourceFile);
    if (OVERFLOW_CLASSES.some((c) => text.includes(c))) return true;
  }
  const styleAttr = findAttribute(attrs, "style");
  if (styleAttr) {
    const text = styleAttr.getText(sourceFile);
    if (/overflow(X)?\s*:\s*["'`](auto|scroll)["'`]/.test(text)) return true;
  }
  return false;
}

/**
 * Check one file's source text for unwrapped <table> elements. Returns a
 * list of { line, reason } violations (no file path attached - callers add
 * that). Pure function of (src, filename); does no I/O itself so it's
 * directly unit-testable, see scripts/tests/test_check_table_scroll.mjs.
 */
export function checkSource(src, filename) {
  const violations = [];
  if (!src.includes("<table")) return violations;
  const scriptKind = filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX;
  const sourceFile = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true, scriptKind);

  function visit(node) {
    const isTableOpen =
      (ts.isJsxElement(node) && jsxTagName(node.openingElement) === "table") ||
      (ts.isJsxSelfClosingElement(node) && jsxTagName(node) === "table");

    if (isTableOpen) {
      const openingElement = ts.isJsxElement(node) ? node.openingElement : node;
      if (hasNoScrollCheckEscape(openingElement.attributes)) {
        ts.forEachChild(node, visit);
        return;
      }
      const parent = findRenderedParent(node);
      let ok = false;
      let reason = "no wrapping element";
      if (parent && ts.isJsxElement(parent)) {
        const parentTag = jsxTagName(parent.openingElement);
        if (SCROLL_WRAPPER_TAGS.has(parentTag)) {
          ok = true;
        } else if (attributeQualifies(parent.openingElement, sourceFile)) {
          ok = true;
        } else {
          reason = `parent <${parentTag ?? "?"}> has no overflow-x-auto/overflow-auto/overflow-hidden className or overflow style`;
        }
      } else if (parent && ts.isJsxFragment(parent)) {
        reason = "direct parent is a fragment (<>...</>), not a scroll wrapper";
      }
      if (!ok) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ line: line + 1, reason });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

/**
 * Rule 2 - rank-first tables must pin the identity column on phones.
 * A <table> (or <TableBox>) whose FIRST header cell is the literal "#" is a
 * ranked board; the default mobile sticky column would pin that rank number
 * while the row's name scrolls away (this shipped in /business 2026-08-03).
 * Such tables must declare data-sticky-col (<table>) / stickyCol (<TableBox>);
 * the CSS lives in app/globals.css, the standard in DESIGN-STANDARDS.md.
 *
 * Ratchet: scripts/table-scroll-rank-baseline.json freezes pre-existing
 * offender counts per file; a file may never EXCEED its baselined count.
 * Regenerate with --write-rank-baseline only after FIXING files (shrinking
 * the baseline), never to grandfather new violations in.
 */
const RANK_TABLE_TAGS = new Set(["table", "TableBox"]);
const STICKY_ATTRS = { table: "data-sticky-col", TableBox: "stickyCol" };

function firstThText(node) {
  let found;
  function walkTh(n) {
    if (found !== undefined) return;
    const isTh =
      (ts.isJsxElement(n) && jsxTagName(n.openingElement) === "th") ||
      (ts.isJsxSelfClosingElement(n) && jsxTagName(n) === "th");
    if (isTh) {
      let text = "";
      if (ts.isJsxElement(n)) {
        for (const c of n.children) {
          if (ts.isJsxText(c)) text += c.text;
        }
      }
      found = text.trim();
      return;
    }
    ts.forEachChild(n, walkTh);
  }
  ts.forEachChild(node, walkTh);
  return found;
}

export function checkRankSticky(src, filename) {
  const violations = [];
  if (!src.includes("<table") && !src.includes("<TableBox")) return violations;
  const scriptKind = filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX;
  const sourceFile = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true, scriptKind);
  function visit(node) {
    if (ts.isJsxElement(node)) {
      const tag = jsxTagName(node.openingElement);
      if (tag && RANK_TABLE_TAGS.has(tag) && firstThText(node) === "#") {
        const attr = STICKY_ATTRS[tag];
        if (!findAttribute(node.openingElement.attributes, attr)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          violations.push({
            line: line + 1,
            reason: `rank-first <${tag}> needs ${attr}={2}: pin the name column, not the rank, on phones`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

function checkFile(file, violations) {
  const src = readFileSync(file, "utf8");
  for (const v of checkSource(src, file)) {
    violations.push({ file: relative(REPO_ROOT, file).split(sep).join("/"), ...v });
  }
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));
  const violations = [];
  for (const file of files) checkFile(file, violations);

  // Rule 2 (rank-first sticky column), ratcheted against the baseline.
  const BASELINE_PATH = join(__dirname, "table-scroll-rank-baseline.json");
  const rankByFile = new Map();
  for (const file of files) {
    const v = checkRankSticky(readFileSync(file, "utf8"), file);
    if (v.length) rankByFile.set(relative(REPO_ROOT, file).split(sep).join("/"), v);
  }
  if (process.argv.includes("--write-rank-baseline")) {
    const counts = {};
    for (const f of [...rankByFile.keys()].sort()) counts[f] = rankByFile.get(f).length;
    writeFileSync(BASELINE_PATH, JSON.stringify(counts, null, 2) + "\n");
    console.log(`check:table-scroll - wrote rank baseline (${rankByFile.size} files, ${[...rankByFile.values()].reduce((s, v) => s + v.length, 0)} tables)`);
    return;
  }
  let baseline = {};
  try { baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")); } catch { /* first run: no baseline */ }
  const rankViolations = [];
  for (const [f, v] of rankByFile) {
    if (v.length > (baseline[f] ?? 0)) {
      for (const item of v) rankViolations.push({ file: f, ...item });
    }
  }
  if (rankViolations.length > 0) {
    console.error("");
    console.error("check:table-scroll - FAIL (rank-first sticky column)");
    console.error("");
    console.error("These ranked tables lead with a '#' column but don't declare which column");
    console.error("stays pinned during sideways scroll on phones, so the rank number sticks");
    console.error("while the row's name scrolls out of view. Add data-sticky-col=\"2\" to the");
    console.error("<table> (or stickyCol={2} to <TableBox>). See DESIGN-STANDARDS.md.");
    console.error("(Files listed exceed their count in scripts/table-scroll-rank-baseline.json.)");
    console.error("");
    for (const v of rankViolations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    ${v.reason}`);
    }
    console.error("");
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(`check:table-scroll - OK (${files.length} files scanned)`);
    process.exit(0);
  }

  console.error("");
  console.error("check:table-scroll - FAIL");
  console.error("");
  console.error("These <table> elements aren't a direct child of <TableScroll> or an");
  console.error("overflow-x-auto/overflow-auto/overflow-hidden wrapper, so they won't get");
  console.error("the sitewide scroll container, sticky header, or mobile touch scrolling.");
  console.error("Wrap the table in <TableScroll> (app/_shared/TableScroll.tsx), or add");
  console.error("data-no-scroll-check to the <table> if it's intentionally never wide.");
  console.error("");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.reason}`);
  }
  console.error("");
  process.exit(1);
}

// pathToFileURL handles Windows paths (backslashes, drive letters); the old
// `file://${argv[1]}` comparison never matched on Windows, so the check was
// silently a no-op there (found 2026-08-03).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

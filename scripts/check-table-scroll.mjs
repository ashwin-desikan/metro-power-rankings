#!/usr/bin/env node
/**
 * Static guard: every <table> in app/ must be a direct JSX child of either
 * the shared <TableScroll> component (app/_shared/TableScroll.tsx) or an
 * element carrying overflow-x-auto / overflow-auto / overflow-hidden (via
 * className or an inline style overflowX/overflow), matching the sitewide
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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const SCAN_DIRS = ["app"];
const EXTS = new Set([".tsx", ".jsx"]);
const OVERFLOW_CLASSES = ["overflow-x-auto", "overflow-auto", "overflow-hidden"];

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
        if (parentTag === "TableScroll") {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

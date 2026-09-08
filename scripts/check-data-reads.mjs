#!/usr/bin/env node
/**
 * Static guard against public/data reads the Vercel file tracer (@vercel/nft)
 * cannot scope. See scripts/DATA-READS-RECIPE.md for the full rationale and
 * the fix patterns this gate expects.
 *
 * @vercel/nft statically evaluates the argument of every readFileSync /
 * existsSync / readdirSync call. It understands
 * `join(process.cwd(), "public", "data", "x.json")` and the same through a
 * module-level `const DATA_DIR = join(process.cwd(), "public", "data")`.
 * When the argument has a dynamic segment sitting directly under
 * public/data, the tracer globs the deepest literal directory it can see --
 * which, for a bare `public/data/<dynamic>`, is all of public/data (265 MB
 * measured 2026-09-08).
 *
 * RULES
 *  (a) `join(process.cwd(), "public", "data", X)` (or `path.join(...)`, or
 *      the same call with more than one segment after "data") where the
 *      FIRST segment after "data" is not a string literal. Also covers the
 *      bare template-literal form `` `${process.cwd()}/public/data/...}` ``
 *      with a dynamic segment.
 *  (b) `join(<IDENT>, X)` where IDENT is a module-level const assigned
 *      `join(process.cwd(), "public", "data")`, and X is not a string
 *      literal.
 *  (c) `join(process.cwd(), "public", "data", "<literal>", ..., X)` where
 *      the dynamic leaf X is a template literal containing "/" or "\\" --
 *      a relative path smuggled through what looks like a single leaf
 *      segment.
 *
 * A dynamic LEAF under at least one literal subdirectory is fine (rule 2 of
 * the recipe): `join(process.cwd(), "public", "data", "nfl", "elo",
 * "seasons", `${season}.json`)` does not trip any of the above.
 *
 * RATCHET. scripts/data-reads-baseline.json freezes the per-file offender
 * counts that exist today. A file may never exceed its baseline; shrink it
 * with --write-baseline after fixing files, never grow it to make the gate
 * pass.
 *
 * Run: node scripts/check-data-reads.mjs   (also part of npm run verify)
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BASELINE_PATH = join(__dirname, "data-reads-baseline.json");
const SCAN_DIRS = ["app", "lib"];
const EXTS = new Set([".ts", ".tsx"]);

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

/** Is `s` (a single top-level argument's trimmed source text) a literal the
 *  tracer can statically resolve? A plain string literal, or a template
 *  literal with no `${` interpolation at all. */
function isLiteralArg(s) {
  const t = s.trim();
  if (/^(['"])(?:[^\\]|\\.)*\1$/.test(t)) return true; // 'x' or "x"
  if (/^`(?:[^`\\]|\\.)*`$/.test(t) && !t.includes("${")) return true; // `x`, no interpolation
  return false;
}

function isDataRootLiteral(s) {
  const t = s.trim();
  return /^(['"])(?:public|data)\1$/.test(t);
}

/** Split a balanced (no unmatched paren/brace/bracket) argument-list string
 *  into its top-level comma-separated arguments. */
function splitArgs(argsText) {
  const out = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  let inStr = null; // active quote char, or null
  while (i < argsText.length) {
    const c = argsText[i];
    if (inStr) {
      cur += c;
      if (c === "\\") {
        cur += argsText[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      cur += c;
      i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim().length) out.push(cur);
  return out;
}

/** Find every `join(...)` / `path.join(...)` call in `src`, returning the
 *  0-based char offset of the call and its balanced argument-list text. */
function findJoinCalls(src) {
  const calls = [];
  const re = /(?:\bpath\.join|\bjoin)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const openIdx = m.index + m[0].length - 1; // index of the "("
    let depth = 1;
    let i = openIdx + 1;
    let inStr = null;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (inStr) {
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === inStr) inStr = null;
        i++;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        inStr = c;
        i++;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    const argsText = src.slice(openIdx + 1, i - 1);
    calls.push({ start: m.index, argsText });
  }
  return calls;
}

/** Module-level `const NAME = join(process.cwd(), "public", "data", ...)`
 *  identifiers (rule b's IDENT) -- and any literal-segments-only chain built
 *  from one, e.g. `const FOOTBALL_DIR = join(DATA_DIR, "football")` where
 *  DATA_DIR is itself such a const. Every one of these resolves, statically,
 *  to a single fixed directory under public/data -- `join(IDENT, X)` with a
 *  dynamic X is therefore a dynamic LEAF directly under that one directory
 *  (rule 2), never a dynamic directory segment. A const is recognized only
 *  when every join() argument after the base is a string/template literal;
 *  one dynamic segment anywhere in the chain (e.g. `join(cwd, "public",
 *  "data", sportDir)`) disqualifies it, so callers of `join(IDENT, X)` fall
 *  through to being checked as an ordinary, unscoped call. */
function findDataDirConsts(src) {
  // `const NAME = (path.)?join(...)` at any nesting -- the recipe's DATA_DIR
  // consts are always module-level in practice, and matching structurally
  // (via the same balanced-paren scanner as findJoinCalls) is more robust
  // than a hand-rolled regex for the argument list.
  const constRe = /\bconst\s+(\w+)\s*=\s*(?:path\.)?join\s*\(/g;
  /** @type {Map<string, string[]>} name -> its join() call's split args */
  const candidates = new Map();
  let cm;
  while ((cm = constRe.exec(src)) !== null) {
    const name = cm[1];
    const openIdx = cm.index + cm[0].length - 1;
    let depth = 1;
    let i = openIdx + 1;
    let inStr = null;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (inStr) {
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === inStr) inStr = null;
        i++;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        inStr = c;
        i++;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    candidates.set(name, splitArgs(src.slice(openIdx + 1, i - 1)));
  }

  // name -> depth: how many literal segments the const holds beyond
  // public/data itself. depth 0 means the const IS the bare public/data
  // root (the classic DATA_DIR = join(cwd,"public","data")); depth > 0
  // means it already names a specific literal subdirectory (e.g.
  // "public/data/football"), so a single dynamic LEAF joined onto it is a
  // rule-2 scoped read, not a rule-B violation.
  const resolved = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, args] of candidates) {
      if (resolved.has(name)) continue;
      if (args.length === 0) continue;
      const first = args[0].replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const isRootBase =
        first === "process.cwd()" &&
        args.length >= 3 &&
        isDataRootLiteral(args[1]) &&
        isDataRootLiteral(args[2]) &&
        args.slice(3).every(isLiteralArg);
      const isDerived =
        resolved.has(first) && args.length >= 2 && args.slice(1).every(isLiteralArg);
      if (isRootBase) {
        resolved.set(name, args.length - 3);
        changed = true;
      } else if (isDerived) {
        resolved.set(name, resolved.get(first) + (args.length - 1));
        changed = true;
      }
    }
  }
  return resolved;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

/**
 * @returns {{rule: "A"|"B"|"C", line: number, detail: string}[]}
 */
export function checkFile(src) {
  const out = [];
  const dataDirConsts = findDataDirConsts(src);
  const calls = findJoinCalls(src);

  for (const { start, argsText } of calls) {
    const args = splitArgs(argsText);
    if (args.length === 0) continue;
    const first = args[0].replace(/\/\*[\s\S]*?\*\//g, "").trim();

    if (first === "process.cwd()") {
      // Must be followed by literal "public", "data" to be a data-root call.
      if (args.length >= 3 && isDataRootLiteral(args[1]) && isDataRootLiteral(args[2])) {
        const rest = args.slice(3);
        if (rest.length === 0) continue; // no dynamic segment at all
        const dirSegs = rest.slice(0, -1);
        const leaf = rest[rest.length - 1];
        const badDir = dirSegs.some((a) => !isLiteralArg(a));
        if (rest.length === 1 && !isLiteralArg(leaf)) {
          out.push({
            rule: "A",
            line: lineOf(src, start),
            detail: `join(process.cwd(), "public", "data", ${leaf.trim()}) — first segment after "data" is dynamic`,
          });
          continue;
        }
        if (badDir) {
          out.push({
            rule: "A",
            line: lineOf(src, start),
            detail: `join(process.cwd(), "public", "data", ...) — a directory segment before the leaf is dynamic`,
          });
          continue;
        }
        // All dir segments literal; leaf may be dynamic (rule 2), but a
        // template-literal leaf smuggling a "/" or "\\" is a relative path
        // in disguise.
        const leafTrim = leaf.trim();
        if (/^`(?:[^`\\]|\\.)*`$/.test(leafTrim) && leafTrim.includes("${")) {
          const staticParts = leafTrim.replace(/\$\{[^}]*\}/g, "");
          if (/[/\\]/.test(staticParts)) {
            out.push({
              rule: "C",
              line: lineOf(src, start),
              detail: `join(..., ${leafTrim}) — dynamic leaf contains a path separator`,
            });
          }
        }
      }
      continue;
    }

    if (dataDirConsts.has(first)) {
      const baseDepth = dataDirConsts.get(first);
      const rest = args.slice(1);
      if (rest.length === 0) continue;
      const dirSegs = rest.slice(0, -1);
      const leaf = rest[rest.length - 1];
      if (dirSegs.some((a) => !isLiteralArg(a))) {
        out.push({
          rule: "B",
          line: lineOf(src, start),
          detail: `join(${first}, ...) — a directory segment before the leaf is dynamic`,
        });
        continue;
      }
      if (baseDepth === 0) {
        // The const is the bare public/data root. Measured against Next's
        // own tracer (2026-09-08): join(ROOT_CONST, "a.json") with a LITERAL
        // leaf still bundles every file under public/data, because the
        // tracer globs the const's directory rather than resolving the
        // join. A const that already names a subdirectory globs only that
        // subdirectory, which is the rule-2 shape. So any join off the root
        // const is a violation, literal leaf or not.
        out.push({
          rule: "B",
          line: lineOf(src, start),
          detail: `join(${first}, ${leaf.trim()}) — ${first} is the bare public/data root; inline the literal path instead`,
        });
        continue;
      }
      // Otherwise the dynamic leaf sits under at least one literal segment
      // (either the const's own scoped subdirectory, or a literal dirSeg
      // here) -- a rule-2 scoped read. Still guard against a template leaf
      // smuggling a "/" as a relative path.
      const leafTrim = leaf.trim();
      if (/^`(?:[^`\\]|\\.)*`$/.test(leafTrim) && leafTrim.includes("${")) {
        const staticParts = leafTrim.replace(/\$\{[^}]*\}/g, "");
        if (/[/\\]/.test(staticParts)) {
          out.push({
            rule: "C",
            line: lineOf(src, start),
            detail: `join(${first}, ..., ${leafTrim}) — dynamic leaf contains a path separator`,
          });
        }
      }
    }
  }

  // Bare template-literal path construction:
  // `${process.cwd()}/public/data/...${dynamic}...`
  const tplRe = /`\$\{process\.cwd\(\)\}\/public\/data\/[^`]*`/g;
  let tm;
  while ((tm = tplRe.exec(src)) !== null) {
    const tpl = tm[0];
    const afterData = tpl.slice(tpl.indexOf("/public/data/") + "/public/data/".length, -1);
    const firstSeg = afterData.split("/")[0];
    if (firstSeg.includes("${")) {
      out.push({
        rule: "A",
        line: lineOf(src, tm.index),
        detail: `template literal path with a dynamic segment directly under public/data`,
      });
    }
  }

  return out;
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));
  /** @type {Map<string, number>} */
  const countByFile = new Map();
  /** @type {Map<string, {rule:string,line:number,detail:string}[]>} */
  const detailByFile = new Map();

  for (const file of files) {
    const rel = relative(REPO_ROOT, file).split(sep).join("/");
    const src = readFileSync(file, "utf8");
    const found = checkFile(src);
    if (!found.length) continue;
    countByFile.set(rel, found.length);
    detailByFile.set(rel, found);
  }

  if (process.argv.includes("--list")) {
    for (const [rel, found] of detailByFile) {
      for (const d of found) console.log(`${d.rule}\t${rel}:${d.line}\t${d.detail}`);
    }
    return;
  }

  if (process.argv.includes("--write-baseline")) {
    const obj = {};
    for (const f of [...countByFile.keys()].sort()) obj[f] = countByFile.get(f);
    writeFileSync(BASELINE_PATH, JSON.stringify(obj, null, 2) + "\n");
    const total = [...countByFile.values()].reduce((a, b) => a + b, 0);
    console.log(`check:data-reads - wrote baseline (${countByFile.size} files, ${total} findings)`);
    return;
  }

  let baseline = {};
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    /* first run */
  }

  const violations = [];
  for (const [rel, count] of countByFile) {
    const allowed = baseline[rel] ?? 0;
    if (count > allowed) {
      for (const d of detailByFile.get(rel)) violations.push({ file: rel, ...d });
    }
  }

  const stale = Object.keys(baseline).filter((f) => !countByFile.has(f));

  if (violations.length) {
    console.error("");
    console.error("check:data-reads - FAIL");
    console.error("");
    console.error("These reads have a dynamic path segment the Vercel file tracer cannot");
    console.error("scope, so it globs the deepest literal directory it can see -- up to all");
    console.error("of public/data. See scripts/DATA-READS-RECIPE.md for the fix patterns.");
    console.error("");
    for (const v of violations.slice(0, 40)) {
      console.error(`  [${v.rule}] ${v.file}:${v.line}  ${v.detail}`);
    }
    if (violations.length > 40) console.error(`  ... and ${violations.length - 40} more`);
    console.error("");
    console.error("If a finding is a legacy file not yet fixed, that's fine as long as it's");
    console.error("already in scripts/data-reads-baseline.json at least this count -- never");
    console.error("grow the baseline to make the gate pass, fix the reader instead.");
    console.error("");
    process.exit(1);
  }

  const total = [...countByFile.values()].reduce((a, b) => a + b, 0);
  console.log(`check:data-reads - OK (${files.length} files scanned, ${total} baselined findings in ${countByFile.size} files)`);
  if (stale.length) {
    console.log(
      `check:data-reads - ${stale.length} baselined file${stale.length === 1 ? " is" : "s are"} now clean; shrink the ratchet with:`,
    );
    console.log("  node scripts/check-data-reads.mjs --write-baseline");
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) main();

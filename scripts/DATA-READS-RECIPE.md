# Scoping public/data reads so the tracer bundles only what a route needs

Vercel's file tracer (@vercel/nft) statically evaluates the argument of every
`readFileSync` / `existsSync` / `readdirSync`. It understands
`join(process.cwd(), "public", "data", "x.json")` and the same with a
module-level const that already names a SUBDIRECTORY. It does NOT resolve a
const that names the bare root: see the table below. When
the LAST segment is dynamic it globs the deepest literal directory it can
see, and when the dynamic segment sits directly under `public/data` that
glob is the whole 265 MB. Measured 2026-09-08: `/updates` traces 1 data
file, `/elections` traces 10,416 because `lib/usElections.ts` reads
`join(cwd, "public", "data", file)`.

Measured against Next's own tracer (next/dist/compiled/@vercel/nft) on
2026-09-08, on a fixture tree public/data/{a.json,b.json,sub/c.json}:

| shape | traced |
|---|---|
| `readFileSync(join(cwd, "public", "data", "a.json"))` | a.json |
| `readFileSync(join(cwd, "public", "data", "sub", leaf))`, leaf dynamic | sub/* |
| `const p = (leaf) => join(cwd, "public", "data", "sub", leaf)` then `readFileSync(p("c.json"))` | sub/* |
| `const DIR = join(cwd, "public", "data", "sub")` then `join(DIR, leaf)` | sub/* |
| `const ROOT = join(cwd, "public", "data")` then `join(ROOT, "a.json")`, LITERAL leaf | EVERYTHING |
| a function-local `const dir = join(cwd, "public", "data")` then `join(dir, "a.json")` | EVERYTHING |
| `join(cwd, "public", "data", file)`, file dynamic | EVERYTHING |

So a const is only safe when it already names a subdirectory, and the bare
root const is never safe, even with a literal leaf. `lib/data.ts` carried one
for its whole life; that single const put all of public/data into every
route that imported it.

Rules for every fs read under public/data:

1. A reader that is only ever called with a handful of fixed names gets a
   literal per name. Not a helper taking a string: a map or switch whose
   branches each contain a fully literal path.

   ```ts
   const FILES = {
     core: () => readFileSync(join(process.cwd(), "public", "data", "us-elections.json"), "utf-8"),
     trends: () => readFileSync(join(process.cwd(), "public", "data", "us-elections-trends.json"), "utf-8"),
   } as const;
   ```

2. A reader that genuinely takes a dynamic leaf (a season, a slug) MUST put
   every literal directory segment in the call and only the leaf dynamic,
   and the directory must hold only that reader's files:

   ```ts
   join(process.cwd(), "public", "data", "nfl", "expectation", `season-${season}.json`)
   ```

   `join(DATA_DIR, rel)` with `rel = "nfl/expectation/x.json"` is NOT ok:
   the tracer sees one dynamic segment under public/data. If a helper takes
   a relative path, split it into `(subdir: literal, leaf)` at every call
   site or move the files into their own directory.

3. A `load(file)` helper that prefers GitHub raw and falls back to the local
   file (nflExpectation, plSim, seasonSim, expectation, mlbSim, cfbSim,
   intlExpectation, plExpectation, nflElo, nflSim) keeps that behaviour;
   only the local `readFileSync` path changes, per rules 1 and 2.

4. Never change what a function returns, its caching, or its error handling.
   This is a path-shape refactor only. `npx tsc --noEmit` must stay clean.

5. `scripts/check-data-reads.mjs` is the gate: it flags any fs read whose
   argument has a dynamic segment directly under `public/data`, or a helper
   parameter used as a path segment there. Run it after every file.

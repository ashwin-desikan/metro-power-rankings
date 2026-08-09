#!/usr/bin/env node
/**
 * Run the Python test suite as part of `npm run verify`.
 *
 * Why this exists rather than a bare `pytest scripts/tests` in package.json:
 *
 *   1. THE GATES HAD DRIFTED. CI runs Vitest AND pytest; verify ran only
 *      Vitest. On 2026-08-09 that cost five red CI runs across three pushes
 *      while verify went green every time - the slugify test still asserted
 *      the pre-repair behaviour and nothing local was ever going to say so.
 *      A pre-push gate that checks less than CI is not a gate.
 *   2. `pytest` IS OFTEN NOT ON PATH ON WINDOWS. pip installs it to a Scripts
 *      directory that is not on PATH by default, so the bare command dies with
 *      a shell-level "not recognized" that reads like a broken repo. Going
 *      through `python -m pytest` sidesteps that entirely.
 *   3. A MISSING DEPENDENCY SHOULD NOT LOOK LIKE A TEST FAILURE. If pytest is
 *      not installed this says so and gives the install line, rather than
 *      leaving you to decode ModuleNotFoundError inside a ten-stage chain.
 *
 * Override the interpreter with PYTHON_BIN if you use a venv.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TARGET = "scripts/tests";

function candidates() {
  if (process.env.PYTHON_BIN) return [process.env.PYTHON_BIN];
  // `python` first on Windows, `python3` first elsewhere.
  return process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];
}

// pyenv-win, conda and the Windows Store all hand you a .bat/.cmd shim rather
// than a real executable, and spawnSync cannot launch those without a shell.
// Without this, a perfectly good interpreter reports as "not found".
const needsShell = (bin) => process.platform === "win32" && /\.(bat|cmd)$/i.test(bin);

function probe(bin, args) {
  const r = spawnSync(bin, args, { cwd: ROOT, encoding: "utf8", shell: needsShell(bin) });
  return r.error ? null : r;
}

let python = null;
for (const bin of candidates()) {
  const r = probe(bin, ["--version"]);
  if (r && r.status === 0) {
    python = bin;
    break;
  }
}

if (!python) {
  console.error(
    "check:pytest FAIL\n" +
      `  No Python interpreter found (tried: ${candidates().join(", ")}).\n` +
      "  The suite in scripts/tests covers extract.py, sync_source_xlsx.py and\n" +
      "  stage-leagues.py, which CI runs on every push.\n" +
      "  Set PYTHON_BIN to your interpreter if it lives somewhere unusual.",
  );
  process.exit(1);
}

// `-m pytest --version` rather than `-c "import pytest"`: no argument contains a
// space, so it survives shell:true on the .bat-shim path above without quoting.
const hasPytest = probe(python, ["-m", "pytest", "--version"]);
if (!hasPytest || hasPytest.status !== 0) {
  console.error(
    "check:pytest FAIL\n" +
      `  ${python} cannot import pytest, so the Python suite did not run.\n` +
      "  This is a missing dependency, not a failing test.\n" +
      `  Install it:  ${python} -m pip install -r scripts/requirements-dev.txt`,
  );
  process.exit(1);
}

const run = spawnSync(python, ["-m", "pytest", TARGET, "-q"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: needsShell(python),
});
if (run.error) {
  console.error(`check:pytest FAIL\n  could not launch pytest: ${run.error.message}`);
  process.exit(1);
}
process.exit(run.status ?? 1);

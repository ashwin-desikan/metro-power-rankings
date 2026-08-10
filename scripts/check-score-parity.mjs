#!/usr/bin/env node
/**
 * Verify stage: does the Python metro Score still reproduce the workbook's own
 * cached column BG?
 *
 * SKIPS, LOUDLY, WHEN THE WORKBOOK IS ABSENT. MetroAreas.xlsx is 36MB and
 * gitignored, so it does not exist in CI or on the Mac mini's clone. A gate
 * that fails there would be red on every push for a reason nobody can fix, and
 * a gate that is always red is a gate everybody learns to ignore. The pure
 * decision logic is covered by scripts/tests/test_metro_score.py, which DOES
 * run in CI, so skipping here loses the workbook comparison only.
 *
 * The self-test always runs, workbook or not: it needs no I/O and it is the
 * part that catches a weights file edited into nonsense.
 *
 * Override the interpreter with PYTHON_BIN if you use a venv.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
// METRO_XLSX lets the mini point at wherever its copy lands, and lets the skip
// path above be exercised on a machine that does have the workbook.
const XLSX = process.env.METRO_XLSX
  ? path.resolve(ROOT, process.env.METRO_XLSX)
  : path.join(ROOT, "MetroAreas.xlsx");
const PARITY = path.join("scripts", "metro_score", "parity.py");

const candidates = () =>
  process.env.PYTHON_BIN
    ? [process.env.PYTHON_BIN]
    : process.platform === "win32"
      ? ["python", "python3", "py"]
      : ["python3", "python"];

const needsShell = (bin) => process.platform === "win32" && /\.(bat|cmd)$/i.test(bin);

let python = null;
for (const bin of candidates()) {
  const r = spawnSync(bin, ["--version"], { cwd: ROOT, encoding: "utf8", shell: needsShell(bin) });
  if (!r.error && r.status === 0) { python = bin; break; }
}
if (!python) {
  console.error(
    "check:score-parity FAIL\n" +
      `  No Python interpreter found (tried: ${candidates().join(", ")}).\n` +
      "  Set PYTHON_BIN if yours lives somewhere unusual.",
  );
  process.exit(1);
}

const run = (args) =>
  spawnSync(python, args, { cwd: ROOT, stdio: "inherit", shell: needsShell(python) });

const selfTest = run([PARITY, "--self-test"]);
if ((selfTest.status ?? 1) !== 0) {
  console.error("check:score-parity FAIL - the engine's own self-test did not pass.");
  process.exit(1);
}

if (!existsSync(XLSX)) {
  console.log(
    "check:score-parity SKIPPED (workbook comparison)\n" +
      "  MetroAreas.xlsx is not in this clone - expected in CI and on the mini.\n" +
      "  Pure logic was still checked above, and by scripts/tests/test_metro_score.py.",
  );
  process.exit(0);
}

const parity = run([PARITY, XLSX]);
const code = parity.status ?? 1;
if (code === 0) {
  console.log("check:score-parity OK");
} else if (code === 1) {
  console.error(
    "\ncheck:score-parity FAIL - the engine and the workbook disagree.\n" +
      "  This does NOT say which is right. If Excel has not recalculated since the\n" +
      "  inputs changed, the workbook's cached BG is the stale one and the engine is\n" +
      "  correct - that is the whole reason for this migration. Read the table above.",
  );
} else {
  console.error("\ncheck:score-parity FAIL - the parity run could not complete.");
}
process.exit(code === 0 ? 0 : 1);

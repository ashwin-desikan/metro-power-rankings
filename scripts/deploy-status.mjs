#!/usr/bin/env node
/**
 * Vercel deploy status probe.
 *
 * Run AFTER `git push origin main` to confirm Vercel finished building the
 * commit you just pushed. Writes the result to `.deploy-status.json` at the
 * repo root so future sessions (and future-you) can read what's live without
 * having to open the Vercel dashboard.
 *
 * Auth: this script delegates to the `gh` CLI, which you've already
 * authenticated on your Windows machine. No tokens to manage, no secrets
 * to leak. If `gh` is missing, the script falls back to `curl` with the
 * GITHUB_TOKEN env var.
 *
 * Why this design instead of polling GitHub from inside Cowork: GitHub's
 * API is rate-limited at 60/hr for unauthenticated callers and the Cowork
 * sandbox IP is blocked at the network edge (403 even on /rate_limit).
 * Running the check from your machine is both auth-clean and the natural
 * post-push moment.
 *
 * Output format (.deploy-status.json):
 *   {
 *     "commit": "<full sha>",
 *     "commit_short": "<7-char sha>",
 *     "state": "success" | "failure" | "in_progress" | "queued" | "unknown",
 *     "deployment_url": "<vercel preview / production url, if any>",
 *     "details_url": "<vercel build log url>",
 *     "checked_at": "<iso timestamp>",
 *     "raw_check_name": "Vercel" (or whatever the check is labeled)
 *   }
 *
 * Exit codes: 0 = success, 1 = failure or unknown, 2 = still building.
 *
 * Usage:
 *   npm run deploy-status              # check HEAD
 *   node scripts/deploy-status.mjs <sha>   # check a specific commit
 */

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const OWNER = "ashwin-desikan";
const REPO = "metro-power-rankings";

function shell(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function resolveCommit() {
  const argSha = process.argv[2];
  if (argSha) return argSha;
  try {
    return shell("git rev-parse HEAD");
  } catch (e) {
    console.error("deploy-status: could not resolve HEAD via git -", e.message);
    process.exit(1);
  }
}

function ghAvailable() {
  const r = spawnSync("gh", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

function fetchCheckRunsViaGh(sha) {
  const r = spawnSync(
    "gh",
    ["api", `repos/${OWNER}/${REPO}/commits/${sha}/check-runs`, "--paginate"],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error("gh api failed: " + (r.stderr || r.stdout || "unknown"));
  }
  return JSON.parse(r.stdout);
}

function fetchCheckRunsViaCurl(sha) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "neither `gh` nor GITHUB_TOKEN env var is available. Install GitHub CLI " +
      "and run `gh auth login`, or set GITHUB_TOKEN to a PAT with repo:read scope."
    );
  }
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/commits/${sha}/check-runs`;
  const cmd = `curl -fsS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer ${token}" -H "User-Agent: deploy-status" "${url}"`;
  const raw = shell(cmd);
  return JSON.parse(raw);
}

function fetchCheckRuns(sha) {
  if (ghAvailable()) return fetchCheckRunsViaGh(sha);
  return fetchCheckRunsViaCurl(sha);
}

// Pick the Vercel check. Vercel's GitHub App labels its check "Vercel" by
// default, but project-scoped deploys also produce per-project labels like
// "Vercel - metro-power-rankings". Match liberally.
function pickVercelCheck(payload) {
  const runs = (payload && payload.check_runs) || [];
  // Strongest match first: official Vercel app
  const byApp = runs.find(
    (r) => r.app && r.app.slug === "vercel" && r.name,
  );
  if (byApp) return byApp;
  // Fallback: name starts with "Vercel"
  const byName = runs.find((r) => /^vercel/i.test(r.name || ""));
  if (byName) return byName;
  return null;
}

function normalizeState(check) {
  // GitHub check-runs use a status + conclusion split:
  //   status: queued | in_progress | completed
  //   conclusion: success | failure | cancelled | skipped | timed_out | neutral | action_required
  if (!check) return "unknown";
  if (check.status === "completed") return check.conclusion || "unknown";
  return check.status; // queued or in_progress
}

function shortSha(sha) {
  return sha.slice(0, 7);
}

function main() {
  const sha = resolveCommit();
  console.log(`deploy-status: probing ${shortSha(sha)}...`);

  let payload;
  try {
    payload = fetchCheckRuns(sha);
  } catch (e) {
    console.error(`deploy-status: lookup failed - ${e.message}`);
    process.exit(1);
  }

  const check = pickVercelCheck(payload);
  if (!check) {
    console.error(
      `deploy-status: no Vercel check found on ${shortSha(sha)}. ` +
      `The Vercel GitHub App may not have posted yet — wait 30s and re-run.`
    );
    writeStatus({
      commit: sha,
      commit_short: shortSha(sha),
      state: "unknown",
      deployment_url: null,
      details_url: null,
      checked_at: new Date().toISOString(),
      raw_check_name: null,
    });
    process.exit(2);
  }

  const state = normalizeState(check);
  const status = {
    commit: sha,
    commit_short: shortSha(sha),
    state,
    deployment_url: (check.output && check.output.summary && extractUrl(check.output.summary)) || null,
    details_url: check.details_url || null,
    checked_at: new Date().toISOString(),
    raw_check_name: check.name || null,
  };
  writeStatus(status);

  const tag = {
    success: "PASS",
    failure: "FAIL",
    in_progress: "BUILDING",
    queued: "QUEUED",
  }[state] || state.toUpperCase();

  console.log(`deploy-status: ${tag} on ${shortSha(sha)} (${check.name})`);
  if (status.details_url) console.log(`  build log: ${status.details_url}`);
  if (status.deployment_url) console.log(`  deploy:    ${status.deployment_url}`);

  // Exit codes encode the state so this can be chained in CI / scripts.
  if (state === "success") process.exit(0);
  if (state === "in_progress" || state === "queued") process.exit(2);
  process.exit(1);
}

function writeStatus(s) {
  const out = join(REPO_ROOT, ".deploy-status.json");
  writeFileSync(out, JSON.stringify(s, null, 2) + "\n");
}

// Vercel's check output.summary often embeds a deployment URL in markdown.
// Best-effort extraction so the JSON file has both the build log AND the
// deployed site link.
function extractUrl(text) {
  if (!text) return null;
  const m = /(https?:\/\/[^\s)]+vercel\.app[^\s)]*)/i.exec(text);
  return m ? m[1] : null;
}

main();

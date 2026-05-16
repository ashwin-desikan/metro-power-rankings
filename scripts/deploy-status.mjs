#!/usr/bin/env node
/**
 * Vercel deploy status probe.
 *
 * Run AFTER `git push origin main` to confirm Vercel finished building the
 * commit you just pushed. Writes the result to `.deploy-status.json` at the
 * repo root so future sessions (and future-you) can read what's live without
 * having to open the Vercel dashboard.
 *
 * Auth strategy (zero-config first):
 *   1. `gh` CLI if installed + authenticated (handles auth + rate limits).
 *   2. Anonymous GitHub API (no setup; works for public repos at 60/hr/IP).
 *      Default path for this public repo.
 *   3. Authenticated via GITHUB_TOKEN env var (escape hatch for rate limits
 *      or if the repo flips to private).
 *
 * Vercel integration detection:
 *   Vercel can post deploy state via the Check Runs API (modern, GitHub
 *   App integration) OR via the legacy commit-status API (older hook-only
 *   wiring). This script polls both and merges results so it works with
 *   either integration style. If neither yields a Vercel entry, the
 *   diagnostic dumps every check + status found on the commit so the user
 *   can see whether the GitHub App is wired at all.
 *
 * Windows quirk:
 *   On certain Node versions, calling process.exit() while a fetch keep-
 *   alive socket is mid-teardown triggers a libuv assertion crash. We set
 *   process.exitCode and return instead, letting Node exit cleanly.
 *
 * Output (`.deploy-status.json`):
 *   {
 *     "commit": "<full sha>",
 *     "commit_short": "<7-char sha>",
 *     "state": "success" | "failure" | "in_progress" | "queued" | "unknown",
 *     "deployment_url": "<vercel preview / production url, if any>",
 *     "details_url": "<vercel build log url>",
 *     "checked_at": "<iso timestamp>",
 *     "raw_check_name": "Vercel" or null,
 *     "source": "check-run" | "commit-status" | "none"
 *   }
 *
 * Exit codes: 0 = success, 1 = failure or unknown, 2 = still building.
 *
 * Usage:
 *   npm run deploy-status
 *   node scripts/deploy-status.mjs <sha>
 */

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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
    process.exitCode = 1;
    return null;
  }
}

function ghAvailable() {
  const r = spawnSync("gh", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

class HttpError extends Error {
  constructor(message, status, meta) {
    super(message);
    this.status = status;
    this.meta = meta || {};
  }
}

async function ghFetch(path) {
  // GitHub CLI is wired-in auth + rate-limit handling. Use it when available.
  if (ghAvailable()) {
    const r = spawnSync("gh", ["api", path, "--paginate"], { encoding: "utf8" });
    if (r.status === 0) {
      try { return JSON.parse(r.stdout); } catch { /* fall through */ }
    }
  }
  // Fall back to direct fetch. Anonymous first; escalate to GITHUB_TOKEN
  // if GitHub returns 401/403/429.
  const url = `https://api.github.com/${path}`;
  const baseHeaders = {
    Accept: "application/vnd.github+json",
    "User-Agent": "deploy-status",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  let res = await fetch(url, { headers: baseHeaders });
  if (!res.ok && (res.status === 401 || res.status === 403 || res.status === 429)) {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      res = await fetch(url, {
        headers: { ...baseHeaders, Authorization: `Bearer ${token}` },
      });
    } else {
      throw new HttpError(
        "GitHub returned " + res.status + " for " + path + ". " +
        "Set GITHUB_TOKEN to a PAT (github.com/settings/tokens; classic with " +
        "repo:status, or fine-grained with Actions:read on this repo), or " +
        "install GitHub CLI and run `gh auth login`.",
        res.status,
      );
    }
  }
  if (!res.ok) {
    throw new HttpError(`GET ${path} returned HTTP ${res.status}`, res.status);
  }
  return res.json();
}

// ---------- Sources ----------

// Modern: Check Runs API. Vercel GitHub App posts here.
async function getCheckRuns(sha) {
  const payload = await ghFetch(`repos/${OWNER}/${REPO}/commits/${sha}/check-runs`);
  return Array.isArray(payload?.check_runs) ? payload.check_runs : [];
}

// Legacy: Combined commit status. Older Vercel integrations post here.
async function getCommitStatuses(sha) {
  const payload = await ghFetch(`repos/${OWNER}/${REPO}/commits/${sha}/status`);
  return Array.isArray(payload?.statuses) ? payload.statuses : [];
}

// ---------- Match + normalize ----------

function pickVercelCheckRun(runs) {
  // Vercel GitHub App slug is "vercel". Some setups produce per-project
  // names like "Vercel - <project>". Match liberally.
  const byApp = runs.find((r) => r.app && r.app.slug === "vercel" && r.name);
  if (byApp) return byApp;
  const byName = runs.find((r) => /^vercel/i.test(r.name || ""));
  if (byName) return byName;
  return null;
}

function pickVercelStatus(statuses) {
  // Legacy commit-status entries from Vercel typically carry context
  // "vercel" or "vercel/<project>". Sometimes also under "deployment".
  const byContext = statuses.find(
    (s) => /^vercel(\/|$)/i.test(s.context || ""),
  );
  if (byContext) return byContext;
  const byCreator = statuses.find(
    (s) => /vercel/i.test(s.creator?.login || ""),
  );
  if (byCreator) return byCreator;
  return null;
}

function normalizeStateFromCheckRun(check) {
  if (!check) return "unknown";
  if (check.status === "completed") return check.conclusion || "unknown";
  return check.status; // queued or in_progress
}

function normalizeStateFromStatus(status) {
  // Legacy state vocabulary: pending | success | failure | error
  if (!status) return "unknown";
  const s = (status.state || "").toLowerCase();
  if (s === "pending") return "in_progress";
  if (s === "error" || s === "failure") return "failure";
  if (s === "success") return "success";
  return "unknown";
}

function shortSha(sha) {
  return sha.slice(0, 7);
}

function writeStatus(s) {
  const out = join(REPO_ROOT, ".deploy-status.json");
  writeFileSync(out, JSON.stringify(s, null, 2) + "\n");
}

function extractUrl(text) {
  if (!text) return null;
  const m = /(https?:\/\/[^\s)]+vercel\.app[^\s)]*)/i.exec(text);
  return m ? m[1] : null;
}

async function main() {
  const sha = resolveCommit();
  if (!sha) return;
  console.log(`deploy-status: probing ${shortSha(sha)}...`);

  let runs = [];
  let statuses = [];
  try {
    [runs, statuses] = await Promise.all([
      getCheckRuns(sha).catch(() => []),
      getCommitStatuses(sha).catch(() => []),
    ]);
  } catch (e) {
    console.error(`deploy-status: lookup failed - ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const checkRun = pickVercelCheckRun(runs);
  const statusRow = pickVercelStatus(statuses);

  // Prefer the modern check run when both exist. If only a status row exists,
  // use it. If neither, dump diagnostics so the user can see what IS there.
  let source = "none";
  let state = "unknown";
  let detailsUrl = null;
  let deployUrl = null;
  let rawName = null;

  if (checkRun) {
    source = "check-run";
    state = normalizeStateFromCheckRun(checkRun);
    detailsUrl = checkRun.details_url || null;
    deployUrl = extractUrl(checkRun.output?.summary || "");
    rawName = checkRun.name || null;
  } else if (statusRow) {
    source = "commit-status";
    state = normalizeStateFromStatus(statusRow);
    detailsUrl = statusRow.target_url || null;
    deployUrl = extractUrl(statusRow.description || "") || statusRow.target_url || null;
    rawName = statusRow.context || null;
  }

  const status = {
    commit: sha,
    commit_short: shortSha(sha),
    state,
    deployment_url: deployUrl,
    details_url: detailsUrl,
    checked_at: new Date().toISOString(),
    raw_check_name: rawName,
    source,
  };
  writeStatus(status);

  if (source === "none") {
    console.error(`deploy-status: no Vercel entry found on ${shortSha(sha)}.`);
    if (runs.length === 0 && statuses.length === 0) {
      console.error(
        "  GitHub returned 0 checks and 0 statuses on this commit. Either the " +
        "Vercel GitHub App is not installed on this repo, or it hasn't posted yet."
      );
      console.error(
        "  If you only use a Vercel Deploy Hook (per daily-rebuild.yml), there " +
        "is no commit-level status to read. Install the Vercel GitHub App at " +
        "https://github.com/apps/vercel to enable deploy-status reporting."
      );
    } else {
      console.error("  Checks present:");
      for (const r of runs) {
        console.error(`    [check-run] name="${r.name}" app=${r.app?.slug || "?"} status=${r.status} conclusion=${r.conclusion || "-"}`);
      }
      for (const s of statuses) {
        console.error(`    [status]    context="${s.context}" state=${s.state} creator=${s.creator?.login || "?"}`);
      }
      console.error(
        "  None matched the Vercel patterns. If one of these IS Vercel under a " +
        "different name, share the name and I'll add it to the matcher."
      );
    }
    process.exitCode = 2;
    return;
  }

  const tag = {
    success: "PASS",
    failure: "FAIL",
    in_progress: "BUILDING",
    queued: "QUEUED",
  }[state] || state.toUpperCase();

  console.log(`deploy-status: ${tag} on ${shortSha(sha)} (${rawName}, via ${source})`);
  if (detailsUrl) console.log(`  build log: ${detailsUrl}`);
  if (deployUrl) console.log(`  deploy:    ${deployUrl}`);

  if (state === "success") process.exitCode = 0;
  else if (state === "in_progress" || state === "queued") process.exitCode = 2;
  else process.exitCode = 1;
}

main();

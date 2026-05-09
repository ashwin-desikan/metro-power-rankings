#!/usr/bin/env node
// Manually trigger a Vercel deploy of rankings.citizenofnowhere.org.
//
// Usage:
//   $env:VERCEL_DEPLOY_HOOK_URL = "https://api.vercel.com/v1/integrations/deploy/..."
//   npm run rebuild:trigger
//
// The same URL the GitHub Action uses; see
// .github/workflows/daily-rebuild.yml for setup steps.
//
// Why this exists: the daily Action covers steady-state freshness, but when
// you publish a new Substack post and want the home-page Featured Articles
// strip refreshed in two minutes instead of the next morning, this is the
// one-liner.

const url = process.env.VERCEL_DEPLOY_HOOK_URL;

if (!url) {
  console.error(
    "VERCEL_DEPLOY_HOOK_URL is not set.\n" +
      "Create a Vercel Deploy Hook (Project Settings → Git → Deploy Hooks)\n" +
      "and export it before running this script:\n\n" +
      '  $env:VERCEL_DEPLOY_HOOK_URL = "https://api.vercel.com/v1/integrations/deploy/..."\n' +
      "  npm run rebuild:trigger\n",
  );
  process.exit(1);
}

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trigger: "manual-cli" }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Vercel deploy hook returned ${res.status}: ${text}`);
    process.exit(1);
  }
  console.log(`Vercel deploy queued. Response: ${text}`);
} catch (err) {
  console.error("Failed to reach Vercel deploy hook:", err);
  process.exit(1);
}

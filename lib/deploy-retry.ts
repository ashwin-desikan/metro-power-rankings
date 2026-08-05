// Bumped by hand to force a production rebuild that picks up the rotated
// REVALIDATE_SECRET env var (env changes only apply to a build that reaches READY;
// the dashboard redeploy kept losing the race to [vercel skip] data pushes).
// Not imported anywhere. See mac-mini-jobs/run-deploy-watch.sh.
export const DEPLOY_RETRY = "reval-secret-rebuild";

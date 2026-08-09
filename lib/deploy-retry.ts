// Bumped by hand to force a production rebuild that picks up the new
// ACTIVITY_PASSWORD/ACTIVITY_SESSION_SECRET env vars (env changes only apply
// to a build that reaches READY; the dashboard redeploy targeted the latest
// commit, which was [vercel skip]-tagged, so ignoreCommand correctly skipped
// it and no fresh build ever ran).
// Not imported anywhere. See mac-mini-jobs/run-deploy-watch.sh.
export const DEPLOY_RETRY = "activity-gate-rebuild";

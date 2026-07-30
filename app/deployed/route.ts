// Tiny public endpoint reporting which git commit the currently-serving production
// build was built from. Vercel injects VERCEL_GIT_COMMIT_SHA at build + runtime.
// The deploy-watch job (mac-mini-jobs/run-deploy-watch.sh) polls this to reconcile
// "what's live" vs "the newest app commit" and auto-heal builds that got canceled
// by a concurrent [vercel skip] data push.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

import "server-only";

// The reigning holders, read at RUNTIME (2026-09-15). Powers the Current board
// on /sports/champions and nothing else.
//
// Why this file exists. The board used to come from lib/champions.ts, which
// readFileSync's the 2.6 MB champions-history.json and keeps only the isCurrent
// rows. Because those bytes had to be inside the bundle, every job that
// recorded a champion had to omit [vercel skip] to publish it, and said so in
// its own comments: majors-ingest.yml did it unconditionally, footy-refresh.yml
// branched its commit message to do it whenever the ledger changed. A
// three-line data commit therefore cost a full production build. 6871c2a9d
// (14 Sep 2026, the US Open champions) is the case that prompted this; there
// were seven in the prior 180 days, each one also spending a slot against the
// 2/day cap in scripts/vercel-ignore.sh.
//
// scripts/champions/build_champions.py now also emits champions-current.json,
// the isCurrent rows alone: 97 rows and 38 KB against the ledger's 6,816 and
// 2.6 MB, which is small enough to fetch on every ISR revalidation. Both
// workflows can now commit with [vercel skip] and ping
// /api/revalidate?tag=champions instead.
//
// Deliberately NOT converted, and the tradeoff is real: the <ChampionBadge>
// on the 54 team-page call sites of getCurrentChampionships, the metro
// Championship History, the per-competition rolls and the Time Machine all
// still read the build-time ledger. A new champion reaches this board within
// minutes and those surfaces on the next natural deploy. Converting them would
// mean an async ripple through 54 call sites and a fetch inside all 4,261
// metro pages, which buys a day of freshness on a badge at a cost far above
// the build it saves.

// STATIC IMPORT for the fallback, not readFileSync. The file is small and
// fixed, which is the shape scripts/DATA-READS-RECIPE.md prescribes, and it
// removes any dependence on the Vercel file tracer getting this route right.
// That is not a theoretical worry: the same build measured /teams/golf and
// /teams/tennis tracing none of their majors JSON, the identical silent miss
// the recipe records for lib/international.ts on 2026-09-15. A missing file
// here would empty the board, and because the board is now re-rendered by ISR
// rather than only at deploy, it would do so with no deploy to notice.
// A compiled-in import cannot go missing: if the file is absent the BUILD
// fails, loudly, which is the behaviour to want.
import bundled from "@/public/data/champions-current.json";
import { toChampionship, type Championship, type HistoryRow } from "./champions";

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/champions-current.json";

// Memoised per response size rather than forever, so a warm server instance
// picks up the next champion rather than serving the first list it ever loaded.
// These rows carry no `generated` stamp on purpose: build_champions.py writes
// only when the content differs, and a timestamp would turn every quiet day
// into a commit.
let _cache: { key: string; rows: Championship[] } | null = null;

const BUNDLED: Championship[] = (bundled as unknown as HistoryRow[]).map(toChampionship);

/**
 * Every reigning champion, for the Current board.
 *
 * GitHub raw first, the compiled-in copy second, and it cannot return empty:
 * the fallback is a module constant, not a file read that might find nothing.
 * DATA-READS-RECIPE records (2026-09-15, lib/international.ts) that a fallback
 * quietly returning empty is how a hub shipped "0 teams" for a whole deploy
 * with nothing logged. A board with no champions would fail the same silent way.
 */
export async function getCurrentChampionsLive(): Promise<Championship[]> {
  if (process.env.NODE_ENV === "production") {
    try {
      const res = await fetch(GH_RAW, { next: { revalidate: 3600, tags: ["champions"] } });
      if (res.ok) {
        const text = await res.text();
        const key = `${text.length}`;
        if (_cache && _cache.key === key) return _cache.rows;
        const raw = JSON.parse(text) as HistoryRow[];
        // A truncated or error response must not replace a good local copy.
        if (raw.length) {
          const rows = raw.map(toChampionship);
          _cache = { key, rows };
          return rows;
        }
      }
    } catch {
      /* fall through to the bundled copy */
    }
  }
  return BUNDLED;
}

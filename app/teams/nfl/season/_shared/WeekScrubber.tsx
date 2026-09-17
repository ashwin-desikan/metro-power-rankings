// Moved to app/teams/_shared/WeekScrubber.tsx on 2026-09-17 so the NFL and
// the NBA share ONE scrubber rather than two copies.
//
// 🔴 SHARING THIS IS NOT COSMETIC, IT IS LOAD-BEARING. The scrubber is a React
// context, and the chart and the standings table read it through
// useThroughWeek(). Two copies of this file are two DIFFERENT contexts: a page
// that renders a provider from one copy and a consumer from the other gets
// null from the hook and silently loses the scrub, with no error anywhere.
// That is why the shared version has to be the only one, and why this file is
// a re-export rather than a second implementation.
//
// This shim exists so the NFL's own components (SeasonStandings, SeedTimeline,
// WeeklyEloChart) keep their `./WeekScrubber` import untouched. Nothing here
// should ever gain logic; put it in the shared file.
export {
  WeekScrubberProvider,
  WeekScrubberControl,
  useThroughWeek,
  useWeekScrubber,
} from "@/app/teams/_shared/WeekScrubber";

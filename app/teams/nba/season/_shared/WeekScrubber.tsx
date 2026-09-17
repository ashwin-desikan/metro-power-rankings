// See app/teams/_shared/WeekScrubber.tsx. Re-export only: two copies of this
// file would be two different React contexts, and a page mixing them loses the
// scrub silently. Do not add logic here.
export {
  WeekScrubberProvider,
  WeekScrubberControl,
  useThroughWeek,
  useWeekScrubber,
} from "@/app/teams/_shared/WeekScrubber";

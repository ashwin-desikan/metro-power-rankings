// Moved to app/teams/_shared/SeasonEloChart.tsx on 2026-09-17, shared with the
// NBA. The first bug reported against this chart (a hover highlight that
// survived the pointer leaving) was present in both copies, which is the
// argument for one implementation rather than two.
//
// Re-export only. Anything added here would exist for the NFL and not the NBA,
// which is how the two drifted in the first place.
export { default } from "@/app/teams/_shared/SeasonEloChart";
export type { EloChartTeam, EloChartWeek } from "@/app/teams/_shared/SeasonEloChart";

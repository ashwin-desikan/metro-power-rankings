import "server-only";
import { getFootyLiveStandings, type FootyStandingsView, type FootyStandingRow } from "@/lib/_footyStandings";
export type { FootyStandingsView, FootyStandingRow };
export const getNrlLiveStandings = (): Promise<FootyStandingsView> => getFootyLiveStandings("nrl");

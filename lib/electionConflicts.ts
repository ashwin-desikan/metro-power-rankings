import "server-only";
import { getConflicts, warYears, type War } from "./conflicts";

// Joins the election hubs to /conflicts: which major wars a polity was fighting
// while a given election was held. Powered by the same wars dataset (interstate
// wars since 1945) as the conflicts page, so it stays current with the monthly
// refresh. Detail pages resolve the polity from the hub route, so no per-page
// wiring is needed.

export const HUB_COUNTRY_SLUGS: Record<string, string[]> = {
  "/elections/us": ["united-states"],
  "/elections/uk": ["united-kingdom"],
  "/elections/ca": ["canada"],
  "/elections/eu": [],
  "/elections/mx": ["mexico"],
  "/elections/br": ["brazil"],
  "/elections/ar": ["argentina"],
  "/elections/de": ["germany", "west-germany"],
  "/elections/fr": ["france"],
  "/elections/it": ["italy"],
  "/elections/es": ["spain"],
  "/elections/pl": ["poland"],
  "/elections/nl": ["netherlands"],
  "/elections/ru": ["russia", "soviet-union"],
  "/elections/il": ["israel"],
  "/elections/za": ["south-africa"],
  "/elections/ng": ["nigeria"],
  "/elections/tr": ["turkey"],
  "/elections/in": ["india"],
  "/elections/jp": ["japan"],
  "/elections/au": ["australia"],
  "/elections/nz": ["new-zealand"],
  "/elections/kr": ["south-korea"],
  "/elections/id": ["indonesia"],
  "/elections/tw": ["taiwan"],
  "/elections/cn": ["china"],
  "/elections/ua": ["ukraine"],
  "/elections/iq": ["iraq"],
  "/elections/ps": ["palestine"],
  "/elections/va": [], // conclaves are not wartime ballots in this sense
  "/elections/sg": ["singapore"],
  "/elections/my": ["malaysia"],
  "/elections/ch": ["switzerland"],
  "/elections/be": ["belgium"],
  "/elections/dk": ["denmark"],
};

// Major wars only — border skirmishes would tag half the dataset and dilute
// the signal. The wars file now reaches back to 1500, so wartime chips appear
// across the whole election record (Japan 1942, the UK's coupon election of
// 1918, the Coalition-era votes and beyond).
export function matchWars(wars: War[], slugs: string[], year: number): War[] {
  return wars
    .filter((w) => {
      if (!w.major) return false;
      const s = w.start ? parseInt(w.start.slice(0, 4), 10) : null;
      if (s == null || Number.isNaN(s) || year < s) return false;
      const e = w.ongoing ? 9999 : w.end ? parseInt(w.end.slice(0, 4), 10) : s;
      if (year > e) return false;
      if (w.civil) {
        // a civil war belongs to one country; foreign backers fight there,
        // but it is not their war
        return w.home != null && slugs.includes(w.home);
      }
      return slugs.some(
        (sl) => w.sideA.some((b) => b.slug === sl) || w.sideB.some((b) => b.slug === sl),
      );
    })
    .slice(0, 3);
}

// Display label that avoids doubled years when the war's name already carries
// a parenthetical span ("Somali Civil War (2009–present)").
export function warLabel(w: War): string {
  return /\(\d{4}[^)]*\)\s*$/.test(w.name) ? w.name : `${w.name} (${warYears(w)})`;
}

export async function warsDuringElection(hubHref: string, year: number): Promise<War[]> {
  const slugs = HUB_COUNTRY_SLUGS[hubHref] ?? [];
  if (!slugs.length) return [];
  const wars = await getConflicts();
  return matchWars(wars, slugs, year);
}

export { warYears };

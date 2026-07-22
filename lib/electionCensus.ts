import "server-only";
import { getUsElections } from "./usElections";
import { getUkElections } from "./ukElections";
import { getCaElections } from "./caElections";
import { getEuElections } from "./euElections";
import { getAuElections } from "./auElections";
import { getDeElections } from "./deElections";
import { getFrElections } from "./frElections";
import { getInElections } from "./inElections";
import { getJpElections } from "./jpElections";
import { getZaElections } from "./zaElections";
import { getMxElections } from "./mxElections";
import { getBrElections } from "./brElections";
import { getIlElections } from "./ilElections";
import { getItElections } from "./itElections";
import { getKrElections } from "./krElections";
import { getIdElections } from "./idElections";
import { getEsElections } from "./esElections";
import { getPlElections } from "./plElections";
import { getNlElections } from "./nlElections";
import { getArElections } from "./arElections";
import { getTwElections } from "./twElections";
import { getNgElections } from "./ngElections";
import { getNzElections } from "./nzElections";
import { getRuElections } from "./ruElections";
import { getCnElections } from "./cnElections";
import { getTrElections } from "./trElections";
import { getUaElections } from "./uaElections";
import { getIqElections } from "./iqElections";
import { getPsElections } from "./psElections";
import { getSgElections } from "./sgElections";
import { getMyElections } from "./myElections";
import { getChElections } from "./chElections";
import { getBeElections } from "./beElections";
import { getDkElections } from "./dkElections";
import { ELECTION_HUBS } from "./electionHubsMeta";
// The Vatican hub is deliberately absent: conclaves are not polity-wide ballots,
// so they stay out of the timeline, turnout and wartime joins.

// One flat view of every election in the atlas — powers the landing timeline
// and the wartime cross-references. f follows the honesty labels:
// 0 free, 1 restricted/tilted (caveat), 2 unfree ritual.

export type CensusItem = {
  id: string;
  year: number;
  label: string;
  title: string; // "Poland 2023 — Law and Justice"
  winner: string | null;
  f: 0 | 1 | 2;
};
export type CensusRow = { code: string; name: string; href: string; items: CensusItem[] };

type LegLike = { id: string; year: number; label: string; seatLeader?: string | null; caveat?: string | null; unfree?: string | null };
type PresLike = { id: string; year: number; label: string; presAfter?: { name: string } | null; caveat?: string | null; unfree?: string | null };

const fOf = (e: { caveat?: string | null; unfree?: string | null }): 0 | 1 | 2 =>
  e.unfree ? 2 : e.caveat ? 1 : 0;

const leg = (els: LegLike[], nm: string): CensusItem[] =>
  els.map((e) => ({
    id: e.id, year: e.year, label: e.label,
    winner: e.seatLeader ?? null,
    title: `${nm} ${e.label}${e.seatLeader ? ` — ${e.seatLeader}` : ""}`,
    f: fOf(e),
  }));
const pres = (els: PresLike[], nm: string): CensusItem[] =>
  els.map((e) => ({
    id: e.id, year: e.year, label: `${e.label} presidential`,
    winner: e.presAfter?.name ?? null,
    title: `${nm} ${e.label} presidential${e.presAfter ? ` — ${e.presAfter.name}` : ""}`,
    f: fOf(e),
  }));

let _census: CensusRow[] | null = null;
export function getElectionCensus(): CensusRow[] {
  if (_census) return _census;
  const row = (hub: string, items: CensusItem[]): CensusRow => {
    const m = ELECTION_HUBS[hub];
    return { code: hub, name: m.name, href: m.href, items: items.sort((a, b) => a.year - b.year) };
  };
  const usd = getUsElections();
  const fr = getFrElections(), pl = getPlElections(), ru = getRuElections(), kr = getKrElections();
  const idn = getIdElections(), tr = getTrElections(), ng = getNgElections(), mx = getMxElections(), br = getBrElections();
  const ua = getUaElections(), iq = getIqElections(), ps = getPsElections();
  _census = [
    row("us", usd.elections.map((e) => ({
      id: e.id, year: e.year, label: e.label, winner: e.winner.name,
      title: `United States ${e.label} — ${e.winner.name}`, f: 0 as const,
    }))),
    row("uk", leg(getUkElections().elections, "United Kingdom")),
    row("eu", leg(getEuElections().elections, "European Parliament")),
    row("de", leg(getDeElections().elections, "Germany")),
    row("fr", [...leg(fr.legislative, "France"), ...pres(fr.presidential, "France")]),
    row("it", leg(getItElections().elections, "Italy")),
    row("es", leg(getEsElections().elections, "Spain")),
    row("pl", [...leg(pl.legislative, "Poland"), ...pres(pl.presidential, "Poland")]),
    row("nl", leg(getNlElections().elections, "Netherlands")),
    row("ru", [...leg(ru.legislative, "Russia"), ...pres(ru.presidential, "Russia")]),
    row("in", leg(getInElections().elections, "India")),
    row("jp", leg(getJpElections().elections, "Japan")),
    row("au", leg(getAuElections().elections, "Australia")),
    row("kr", [...leg(kr.legislative, "South Korea"), ...pres(kr.presidential, "South Korea")]),
    row("id", [...leg(idn.legislative, "Indonesia"), ...pres(idn.presidential, "Indonesia")]),
    row("tw", pres(getTwElections().elections, "Taiwan")),
    row("nz", leg(getNzElections().elections, "New Zealand")),
    row("cn", leg(getCnElections().elections, "China")),
    row("za", leg(getZaElections().elections, "South Africa")),
    row("il", leg(getIlElections().elections, "Israel")),
    row("tr", [...leg(tr.legislative, "Turkey"), ...pres(tr.presidential, "Turkey")]),
    row("ng", [...leg(ng.legislative, "Nigeria"), ...pres(ng.presidential, "Nigeria")]),
    row("ca", leg(getCaElections().elections, "Canada")),
    row("mx", [...leg(mx.legislative, "Mexico"), ...pres(mx.presidential, "Mexico")]),
    row("br", [...leg(br.legislative, "Brazil"), ...pres(br.presidential, "Brazil")]),
    row("ar", pres(getArElections().elections, "Argentina")),
    row("ua", [...leg(ua.legislative, "Ukraine"), ...pres(ua.presidential, "Ukraine")]),
    row("iq", [...leg(iq.legislative, "Iraq"), ...pres(iq.presidential, "Iraq")]),
    row("ps", [...leg(ps.legislative, "Palestine"), ...pres(ps.presidential, "Palestine")]),
    row("sg", leg(getSgElections().elections, "Singapore")),
    row("my", leg(getMyElections().elections, "Malaysia")),
    row("ch", leg(getChElections().elections, "Switzerland")),
    row("be", leg(getBeElections().elections, "Belgium")),
    row("dk", leg(getDkElections().elections, "Denmark")),
  ];
  return _census;
}

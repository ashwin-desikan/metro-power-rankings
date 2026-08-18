import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { f1ConstructorCrestName } from "@/lib/f1Crest";
import { getF1ConstructorByName } from "@/lib/f1Constructors";

/**
 * A constructor's name, linked to its team page when one exists.
 *
 * EVERY constructor name rendered anywhere on the site should come through
 * here. Until 2026-08-18 none of them did: the F1 hub had exactly one link to
 * 78 team pages (a nav chip), and all 1,158 race rows across the 77 circuit
 * pages named a winning constructor in plain text.
 *
 * 🔴 THE LABEL IS THE PERIOD NAME, THE LINK IS THE ORGANISATION. A 1967 race
 * was won by a "Lotus-Ford" and the table should say so; it points at Team
 * Lotus because that is who they were. Rewriting the label to the modern name
 * would be as wrong as the archive splitting the wins, just in the other
 * direction. Same discipline as era_names.csv on the rankings board.
 */
export default function F1TeamName({
  name,
  crest = true,
}: {
  name: string;
  crest?: boolean;
}) {
  const t = getF1ConstructorByName(name);
  const label = (
    <>
      {crest && <CrestIcon name={f1ConstructorCrestName(name)} />}
      {name}
    </>
  );
  if (!t) return <span className="inline-flex items-center gap-1.5 min-w-0">{label}</span>;
  return (
    <Link
      href={`/teams/f1/constructors/${t.slug}`}
      className="hover:underline inline-flex items-center gap-1.5 min-w-0"
      style={{ color: "inherit" }}
    >
      {label}
    </Link>
  );
}

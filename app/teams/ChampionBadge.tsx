import type { Championship } from "@/lib/champions";

// Gold "current champions" badge rendered on a team page header. One pill per
// reigning competition the team currently holds.
export default function ChampionBadge({ items }: { items: Championship[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37", border: "1px solid rgba(212,175,55,0.4)" }}
          title={`Current ${c.scopeType ? c.scopeType.toLowerCase() + " " : ""}champion${c.scope ? " (" + c.scope + ")" : ""}`}
        >
          <span aria-hidden>🏆</span>
          {c.year ? `${c.year} ` : ""}{c.competition}{/champion/i.test(c.competition) ? "" : " Champions"}
        </span>
      ))}
    </div>
  );
}

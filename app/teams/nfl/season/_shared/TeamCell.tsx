import Link from "next/link";

// One team, identified the way the rest of the NFL hub identifies a team:
// crest, then name, then a link to its page.
//
// 🔴 A DEFUNCT TEAM IS STILL A LINK. /teams/nfl/historical carries pages for
// the Akron Pros and the Cleveland Rams, so a 1920 standings row is as
// clickable as a 2025 one. Only a franchise with genuinely no page renders as
// plain text, and no invented crest is drawn for it: the monogram fallback is
// reserved for the 32 franchises whose colours are stored.

export type TeamIdent = {
  slug: string | null;
  logo: string | null;
  mono: { bg: string; fg: string; mono: string } | null;
};

export default function TeamCell({
  city,
  team,
  name,
  ident,
  size = 20,
}: {
  city?: string | null;
  team?: string | null;
  name: string;
  ident?: TeamIdent;
  size?: number;
}) {
  const label = [city, team].filter(Boolean).join(" ") || name;
  const crest = ident?.logo ? (
    <img src={ident.logo} alt="" width={size} height={size}
      className="flex-shrink-0 object-contain" style={{ width: size, height: size }}
      loading="lazy" decoding="async" />
  ) : ident?.mono ? (
    <span aria-hidden className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{ background: ident.mono.bg, color: ident.mono.fg, width: size, height: size,
        fontSize: size * 0.36, fontWeight: 700, letterSpacing: "-0.02em" }}>
      {ident.mono.mono}
    </span>
  ) : (
    <span aria-hidden className="inline-block flex-shrink-0 rounded-full"
      style={{ width: size, height: size, border: "1px solid var(--border)" }} />
  );

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {crest}
      {ident?.slug ? (
        <Link href={`/teams/nfl/${ident.slug}`} className="hover:text-[var(--accent)] hover:underline truncate">
          {label}
        </Link>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </span>
  );
}

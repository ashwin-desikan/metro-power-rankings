import type { Metadata } from "next";
import Link from "next/link";
import { getScreen } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ScreenNav from "./ScreenNav";
import { HowItWorks } from "../elections/HubShared";

export const dynamic = "force-static";

const PATH = "/screen";
const TITLE = "The Screen of the Metros";
const DESC =
  "Metro areas ranked by the film industry they raised: a century of top-grossing films, era-normalized so 1939 counts like 2024, credited to directors and billed casts, mapped to the metros that made them, with every Academy Award nomination since 1929 layered on as prestige.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function ScreenPage() {
  const f = getScreen();
  if (!f) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-[var(--text-muted)]">The Screen dataset has not been generated yet.</p>
      </main>
    );
  }
  const divergence = f.academy?.decades ?? [];
  const seventies = divergence.find((d) => d.decade === 1970)?.pctTop10;
  const tens = divergence.find((d) => d.decade === 2010)?.pctTop10;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-2">
          {f.totals.films.toLocaleString("en-US")} films · {f.totals.nominations.toLocaleString("en-US")} Oscar nominations across {f.totals.ceremonies} ceremonies · {f.totals.people.toLocaleString("en-US")} people · updated {f.built}, refreshed after each ceremony
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <div className="flex items-baseline justify-between mb-2">
            <Link href="/screen/rankings" className="font-bold text-[var(--text)] hover:text-[var(--accent)]">Rankings by metro</Link>
            <Link href="/screen/rankings" className="text-xs text-[var(--accent)]">Full table →</Link>
          </div>
          <div className="grid gap-1 text-sm">
            {f.metros.slice(0, 10).map((m, i) => (
              <div key={m.slug} className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text)] min-w-0 truncate">
                  <span className="text-[var(--text-dim)] tabular-nums mr-2">{i + 1}</span>
                  <Link href={`/screen/metros/${m.slug}`} className="hover:underline">{m.name}</Link>
                  <Link href={`/screen/metros/${m.slug}`} title="Screen profile" className="ml-1 align-middle text-xs text-[var(--text-muted)]">&#127916;</Link>
                </span>
                <span className="tabular-nums text-[var(--text-muted)]">{Math.round(m.score)}</span>
              </div>
            ))}
          </div>
        </div>
        <Link href="/screen/people" className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-bold text-[var(--text)]">Leading figures</h2>
            <span className="text-xs text-[var(--accent)]">People &amp; directors →</span>
          </div>
          <div className="grid gap-1 text-sm">
            {f.people.slice(0, 10).map((p, i) => (
              <div key={p.name} className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text)]"><span className="text-[var(--text-dim)] tabular-nums mr-2">{i + 1}</span>{p.name}</span>
                <span className="text-[var(--text-muted)] text-xs truncate">{p.metroName ?? "unattributed"}</span>
              </div>
            ))}
          </div>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <div className="flex items-baseline justify-between mb-2">
            <Link href="/screen/countries" className="font-bold text-[var(--text)] hover:text-[var(--accent)]">Rankings by country</Link>
            <Link href="/screen/countries" className="text-xs text-[var(--accent)]">Full table →</Link>
          </div>
          <div className="grid gap-1 text-sm">
            {(f.countries ?? []).slice(0, 10).map((c, i) => (
              <div key={c.slug} className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text)] min-w-0 truncate">
                  <span className="text-[var(--text-dim)] tabular-nums mr-2">{i + 1}</span>
                  <Link href={`/screen/countries/${c.slug}`} className="hover:underline">{c.name}</Link>
                </span>
                <span className="tabular-nums text-[var(--text-muted)]">{Math.round(c.score)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="block rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <h2 className="font-bold text-[var(--text)] mb-2">Where the movies come from</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Every filmmaker rolls up from their home metro to a country. {(f.countries ?? []).length} countries are scored, led by {(f.countries ?? [])[0]?.name} and {(f.countries ?? [])[1]?.name}. Each has its own profile: the talent it raised and the canon films set on its soil.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Link href="/screen/films" className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-bold text-[var(--text)]">The all-time films</h2>
            <span className="text-xs text-[var(--accent)]">All 250 →</span>
          </div>
          <div className="grid gap-1 text-sm">
            {f.films.slice(0, 8).map((fl, i) => (
              <div key={fl.title + fl.year} className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text)] truncate"><span className="text-[var(--text-dim)] tabular-nums mr-2">{i + 1}</span>{fl.title} <span className="text-[var(--text-dim)]">{fl.year}</span></span>
                <span className="tabular-nums text-[var(--text-muted)]">{fl.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text-dim)] mt-2">Blended: critical standing, audience, box office and longevity.</p>
        </Link>
        <div className="grid gap-4">
          <Link href="/screen/years" className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-bold text-[var(--text)]">Year by year</h2>
              <span className="text-xs text-[var(--accent)]">Browse by decade →</span>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              The top ten at the box office and the night&apos;s big Oscar winners, for every year
              since 1920: the whole century, decade by decade.
            </p>
          </Link>
          <Link href="/screen/academy" className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-bold text-[var(--text)]">The Academy</h2>
              <span className="text-xs text-[var(--accent)]">Charts →</span>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {seventies != null && tens != null
                ? `Best Picture winners were top-ten grossers ${Math.round(seventies)}% of the time in the 1970s, and ${Math.round(tens)}% in the 2010s. The great divorce, plus where the Academy's nominees are born.`
                : "The Academy versus the box office, and where the nominees are born."}
            </p>
          </Link>
        </div>
      </div>

      <HowItWorks
        title="How the Screen rankings work"
        cards={[
          ["The base pillar", "The top ten grossing films of every year since 1920 (Wikipedia's year-in-film tables, which cite Box Office Mojo and The Numbers). Each year distributes a fixed 100 points by gross share, so eras compete on dominance, not inflation. Pre-1930 years are discounted: silent-era box office reporting is fragmentary US rentals."],
          ["Who gets the credit", "A film's box office goes 25% to its director and the rest down the billing order, with later films in a long career counting less, so the prolific no longer crowd out a brilliant few. Two more pillars sit alongside it: Academy prestige and audience acclaim from TMDb, each normalized and blended."],
          ["The prestige pillar", "Academy nominations since 1929, win-weighted and restricted to the marquee categories (picture, directing, acting, writing, cinematography), so craft, shorts and honorary awards no longer crown the list. Data: the open oscar_data project (BSD-2), joined via IMDb identifiers. Films rank separately on their own four-pillar blend."],
          ["The metro connection", "People are attributed to metros by birthplace, resolved deterministically through Wikidata, with editorial overrides where someone is really 'from' somewhere else: Spielberg is Phoenix, not Cincinnati. Vague or rural birthplaces stay unattributed rather than guessed."],
        ]}
      />

      <footer className="mt-6 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Related:{" "}
        <Link href="/sound" className="hover:text-[var(--accent)]">The Sound of the Metros</Link>
        {" · "}
        <Link href="/rankings" className="hover:text-[var(--accent)]">Metro Power Rankings</Link>
        {" · "}
        <Link href="/leaders" className="hover:text-[var(--accent)]">World Leaders</Link>
      </footer>
    </main>
  );
}

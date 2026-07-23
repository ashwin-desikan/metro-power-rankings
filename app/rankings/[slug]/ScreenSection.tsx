import Link from "next/link";
import type { MetroScreen } from "@/lib/screen";

export default function ScreenSection({ screen }: { screen: MetroScreen | null }) {
  if (!screen) return null;
  return (
    <section>
      <h2 id="screen" className="text-2xl font-bold mb-2 scroll-mt-20">
        Screen of {screen.name}
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        #{screen.rank} by film pedigree · score {Math.round(screen.score * 10) / 10} ·{" "}
        {screen.people} {screen.people === 1 ? "person" : "people"} in a century of top-grossing
        films and Oscar nominations ·{" "}
        <Link href="/screen" className="underline hover:text-[var(--accent)]">
          Full film rankings &rarr;
        </Link>
      </p>
      {screen.top.length > 0 && (
        <p className="text-sm mb-4">
          <span className="text-[var(--text-muted)]">Leading figures: </span>
          {screen.top.map((p) => p.name).join(", ")}
        </p>
      )}
    </section>
  );
}

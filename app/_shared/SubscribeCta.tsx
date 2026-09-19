import { MONO, CARD } from "@/app/business/ui";

export type SubscribeCtaPost = {
  title: string;
  url: string;
};

const SUBSTACK_URL = "https://citizenofnowhere.substack.com";

const COPY = {
  home: {
    headline: "The essays behind the rankings, by email.",
  },
  digest: {
    headline: "The long reads behind the daily digest, by email.",
  },
} as const;

/**
 * Compact outbound-subscribe card for the two pages that change every day
 * (the homepage and /digest) and have no subscribe path of their own.
 * Server-safe, no hooks, no form: a single link out to Substack. Copy is
 * fixed by variant; `latestPost` is optional and only ever passed data the
 * caller already has in scope (no new fetch happens here).
 */
export default function SubscribeCta({
  variant = "home",
  latestPost,
  className = "",
}: {
  variant?: "home" | "digest";
  latestPost?: SubscribeCtaPost;
  className?: string;
}) {
  const copy = COPY[variant];
  return (
    <section
      className={`rounded-2xl border p-5 sm:p-6 ${className}`}
      style={CARD}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] uppercase tracking-widest mb-2"
            style={{ ...MONO, color: "var(--accent)" }}
          >
            Subscribe
          </p>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-1">
            {copy.headline}
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] max-w-xl">
            New pieces on cities, sport and power. Free, on Substack.
          </p>
          {latestPost && (
            <a
              href={latestPost.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors min-w-0 truncate max-w-full"
            >
              Latest: {latestPost.title}
            </a>
          )}
        </div>
        <a
          href={SUBSTACK_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center min-h-11 rounded-lg font-semibold text-sm px-5 py-2.5 transition-opacity hover:opacity-90 flex-shrink-0 whitespace-nowrap"
          style={{ backgroundColor: "var(--accent)", color: "#08080D" }}
        >
          Subscribe on Substack
        </a>
      </div>
    </section>
  );
}

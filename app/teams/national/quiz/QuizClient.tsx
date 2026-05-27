"use client";

// International Football quiz, client-rendered. Fetches honors-leaderboard.json
// and similar-teams.json on mount, picks five questions from the top 30, and
// scores the user against the actual data.
//
// Design intent: this is the editorial cold-open for the Substack launch
// post. The fingerprints reward genuine knowledge (Mexico's 13 Gold Cups
// looks distinct from Uruguay's 15 Copas, even both stripped of label),
// and the final screen leverages the similar-teams engine to give the user
// a comp set for the teams they guessed wrong.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { flagForTeam, displayNameForTeam } from "@/lib/international-display";

type LeaderboardEntry = {
  rank: number;
  slug: string;
  cur_name: string;
  continent: string | null;
  honors_index: number;
  honors_breakdown: {
    wc_champ: number;
    wc_finals_lost: number;
    wc_sf_only: number;
    continental_champ: number;
    continental_finals_lost: number;
    intercontinental_champ: number;
    per_continent_champ: Record<string, number>;
  };
  elo_rank: number | null;
  fifa_rank: number | null;
  active: boolean;
};

type SimilarNeighbor = {
  slug: string;
  cur_name: string;
  continent: string | null;
  distance: number;
  shared_axis: string | null;
  honors_index: number | null;
};

type QuizQuestion = {
  answer: LeaderboardEntry;
  options: LeaderboardEntry[]; // includes the answer; shuffled
};

const QUESTION_COUNT = 5;
const FINGERPRINT_AXES: Array<{ key: string; label: string }> = [
  { key: "wc_champ", label: "WC titles" },
  { key: "wc_finals_lost", label: "WC finals lost" },
  { key: "wc_sf_only", label: "WC SFs (no final)" },
  { key: "continental_champ", label: "Continental titles" },
  { key: "intercontinental_champ", label: "Intercontinental wins" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Two-axis editorial caption from the breakdown. Picks the strongest axis
// the answer scored on; gives the user a useful tell on the reveal screen.
function editorialCaption(e: LeaderboardEntry): string {
  const b = e.honors_breakdown;
  const continentTrophies = Object.entries(b.per_continent_champ ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, z) => z[1] - a[1]);
  if (b.wc_champ >= 4) return `${b.wc_champ} World Cups, the apex tier of trophy collectors.`;
  if (b.wc_champ >= 2) return `${b.wc_champ} World Cup titles and a deep continental record.`;
  if (continentTrophies[0] && continentTrophies[0][1] >= 10) {
    const [cat, count] = continentTrophies[0];
    const label =
      cat === "COPA" ? "Copa Américas" :
      cat === "GOLD" ? "Gold Cup / CONCACAF titles" :
      cat === "AFCON" ? "AFCON crowns" :
      cat === "EUROS" ? "European Championships" :
      cat === "ASIAN" ? "Asian Cups" :
      cat === "OFC" ? "OFC Nations Cups" : "continental titles";
    return `${count} ${label} but never crowned at the World Cup.`;
  }
  if (b.wc_finals_lost >= 2) return `${b.wc_finals_lost} World Cup final runs without lifting the trophy.`;
  if (b.wc_champ === 1) return "One World Cup title and a thin continental record relative to peers.";
  if (continentTrophies[0]) {
    const [, count] = continentTrophies[0];
    return `${count} continental titles. A regional power without breaking through at the World Cup.`;
  }
  return "A defensible top-30 entry built on consistent appearances rather than headline wins.";
}

// Distance-based comp pulled from similar-teams.json. Returns up to 2 names.
function compNames(similar: Record<string, SimilarNeighbor[]>, slug: string, n = 2): string[] {
  const list = similar[slug] ?? [];
  return list.slice(0, n).map((s) => displayNameForTeam(s.slug, s.cur_name));
}

export default function QuizClient() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [similar, setSimilar] = useState<Record<string, SimilarNeighbor[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [picksLog, setPicksLog] = useState<Array<{ correct: boolean; answerSlug: string; pickedSlug: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/data/international/honors-leaderboard.json").then((r) => r.json()),
      fetch("/data/international/similar-teams.json").then((r) => r.json()),
    ])
      .then(([honors, sim]) => {
        if (cancelled) return;
        setLeaderboard(honors.leaderboard ?? []);
        setSimilar(sim ?? {});
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function generateQuiz() {
    if (leaderboard.length < QUESTION_COUNT + 3) return;
    const pool = leaderboard.slice(0, Math.min(30, leaderboard.length));
    const answers = shuffle(pool).slice(0, QUESTION_COUNT);
    const built: QuizQuestion[] = answers.map((answer) => {
      const distractors = shuffle(pool.filter((e) => e.slug !== answer.slug)).slice(0, 3);
      return { answer, options: shuffle([answer, ...distractors]) };
    });
    setQuestions(built);
    setCurrentIdx(0);
    setPickedSlug(null);
    setScore(0);
    setPicksLog([]);
  }

  useEffect(() => {
    if (!loading && questions.length === 0 && leaderboard.length > 0) {
      generateQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, leaderboard]);

  const current = questions[currentIdx];
  const isAnswered = pickedSlug !== null;
  const isComplete = questions.length > 0 && currentIdx >= questions.length;

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading the quiz…</p>;
  }
  if (error) {
    return <p className="text-sm text-[var(--text-muted)]">Could not load the quiz data: {error}</p>;
  }
  if (!current && !isComplete) {
    return <p className="text-sm text-[var(--text-muted)]">Preparing questions…</p>;
  }

  if (isComplete) {
    return (
      <FinalScreen
        score={score}
        total={questions.length}
        log={picksLog}
        leaderboard={leaderboard}
        similar={similar}
        onPlayAgain={generateQuiz}
      />
    );
  }

  return (
    <QuestionCard
      questionIdx={currentIdx}
      total={questions.length}
      question={current!}
      pickedSlug={pickedSlug}
      score={score}
      onPick={(slug) => {
        if (pickedSlug !== null) return;
        setPickedSlug(slug);
        const correct = slug === current!.answer.slug;
        if (correct) setScore((s) => s + 1);
        setPicksLog((prev) => [...prev, { correct, answerSlug: current!.answer.slug, pickedSlug: slug }]);
      }}
      onNext={() => {
        setPickedSlug(null);
        setCurrentIdx((i) => i + 1);
      }}
      isAnswered={isAnswered}
    />
  );
}

function FingerprintChart({ breakdown }: { breakdown: LeaderboardEntry["honors_breakdown"] }) {
  // Compute max across axes for normalization. Floor at 5 so a chart with one
  // dominant axis (e.g. Argentina's 16 Copas) still gives the smaller bars
  // visible width.
  const values = FINGERPRINT_AXES.map((a) => Number(breakdown[a.key as keyof typeof breakdown] ?? 0));
  const max = Math.max(5, ...values);
  return (
    <div className="space-y-1.5">
      {FINGERPRINT_AXES.map((a, i) => {
        const v = values[i];
        const pct = (v / max) * 100;
        return (
          <div key={a.key} className="flex items-center gap-2">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide w-32 sm:w-40 flex-shrink-0">
              {a.label}
            </div>
            <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: "rgba(120,120,140,0.10)" }}>
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${pct}%`,
                  background: "var(--accent)",
                  minWidth: v > 0 ? "2px" : 0,
                }}
                aria-hidden
              />
            </div>
            <div className="text-xs tabular-nums font-semibold w-7 text-right">{v}</div>
          </div>
        );
      })}
    </div>
  );
}

function QuestionCard({
  questionIdx,
  total,
  question,
  pickedSlug,
  score,
  onPick,
  onNext,
  isAnswered,
}: {
  questionIdx: number;
  total: number;
  question: QuizQuestion;
  pickedSlug: string | null;
  score: number;
  onPick: (slug: string) => void;
  onNext: () => void;
  isAnswered: boolean;
}) {
  const correctSlug = question.answer.slug;
  return (
    <section
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-baseline justify-between text-xs text-[var(--text-muted)] mb-3">
        <span className="uppercase tracking-wide font-semibold">Question {questionIdx + 1} of {total}</span>
        <span className="tabular-nums">Score: {score}</span>
      </div>
      <FingerprintChart breakdown={question.answer.honors_breakdown} />
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {question.options.map((opt) => {
          const isCorrect = opt.slug === correctSlug;
          const isPicked = opt.slug === pickedSlug;
          let bg = "var(--bg)";
          let border = "var(--border)";
          let color = "var(--text)";
          if (isAnswered) {
            if (isCorrect) {
              bg = "rgba(212,175,55,0.15)";
              border = "#d4af37";
              color = "var(--text)";
            } else if (isPicked) {
              bg = "rgba(120,120,140,0.10)";
              border = "rgba(120,120,140,0.45)";
              color = "var(--text-muted)";
            } else {
              bg = "var(--bg)";
              border = "var(--border)";
              color = "var(--text-dim)";
            }
          }
          return (
            <button
              key={opt.slug}
              type="button"
              onClick={() => onPick(opt.slug)}
              disabled={isAnswered}
              className="text-left rounded-md border px-3 py-2 transition disabled:cursor-default"
              style={{ background: bg, borderColor: border, color }}
            >
              <span className="font-medium">
                {isAnswered ? (
                  <>
                    {flagForTeam(opt.slug) && <span className="mr-1.5" aria-hidden>{flagForTeam(opt.slug)}</span>}
                    {displayNameForTeam(opt.slug, opt.cur_name)}
                  </>
                ) : (
                  displayNameForTeam(opt.slug, opt.cur_name)
                )}
              </span>
              {isAnswered && isCorrect && (
                <span className="ml-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#d4af37" }}>
                  ★ correct
                </span>
              )}
              {isAnswered && isPicked && !isCorrect && (
                <span className="ml-2 text-[11px] uppercase tracking-wide font-semibold text-[var(--text-muted)]">
                  your pick
                </span>
              )}
            </button>
          );
        })}
      </div>
      {isAnswered && (
        <div className="mt-4 text-sm">
          <p className="text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]">
              {flagForTeam(question.answer.slug) && (
                <span className="mr-1.5" aria-hidden>{flagForTeam(question.answer.slug)}</span>
              )}
              {displayNameForTeam(question.answer.slug, question.answer.cur_name)}:
            </span>{" "}
            {editorialCaption(question.answer)}
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              {questionIdx + 1 < total ? "Next question →" : "See your results →"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function FinalScreen({
  score,
  total,
  log,
  leaderboard,
  similar,
  onPlayAgain,
}: {
  score: number;
  total: number;
  log: Array<{ correct: boolean; answerSlug: string; pickedSlug: string }>;
  leaderboard: LeaderboardEntry[];
  similar: Record<string, SimilarNeighbor[]>;
  onPlayAgain: () => void;
}) {
  const headline = useMemo(() => {
    const pct = (score / total) * 100;
    if (pct === 100) return "Encyclopedic. Five for five.";
    if (pct >= 80) return "Strong knowledge of international football history.";
    if (pct >= 60) return "Comfortable across the major programs.";
    if (pct >= 40) return "Solid on the obvious cases. Mid-tier programs trip people up.";
    if (pct >= 20) return "More to learn. The fingerprints separate sharper than they first look.";
    return "Worth running through the leaderboard before round two.";
  }, [score, total]);

  const wrongs = log.filter((p) => !p.correct);
  const slugToEntry = useMemo(() => {
    const m: Record<string, LeaderboardEntry> = {};
    for (const e of leaderboard) m[e.slug] = e;
    return m;
  }, [leaderboard]);

  return (
    <section className="space-y-5">
      <div
        className="rounded-xl border p-6 text-center"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-5xl font-semibold tabular-nums">{score} / {total}</div>
        <p className="mt-3 text-[var(--text)] font-medium">{headline}</p>
        <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onPlayAgain}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            ↻ New questions
          </button>
          <Link
            href="/teams/national#most-decorated"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            View the full leaderboard →
          </Link>
        </div>
      </div>

      {wrongs.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <h2 className="text-base font-semibold mb-2">Your incorrect picks, with comp sets</h2>
          <p className="text-xs text-[var(--text-muted)] mb-4 max-w-3xl">
            For each team you missed, here is its closest historical comp. The similar-teams
            engine clusters by honors profile and historical footprint, so the comps describe
            the cohort the answer actually belongs to.
          </p>
          <div className="space-y-3">
            {wrongs.map((w, i) => {
              const ans = slugToEntry[w.answerSlug];
              if (!ans) return null;
              const comps = compNames(similar, w.answerSlug, 2);
              return (
                <div key={i} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--border)" }}>
                  <div className="text-sm">
                    <span className="font-medium">
                      {flagForTeam(ans.slug) && (
                        <span className="mr-1.5" aria-hidden>{flagForTeam(ans.slug)}</span>
                      )}
                      <Link href={`/teams/national/${ans.slug}`} className="hover:underline">
                        {displayNameForTeam(ans.slug, ans.cur_name)}
                      </Link>
                    </span>
                    <span className="text-[var(--text-muted)]"> · honors {ans.honors_index.toFixed(2)}</span>
                  </div>
                  {comps.length > 0 && (
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      Closest comps: <span className="text-[var(--text)] font-medium">{comps.join(", ")}</span>
                    </div>
                  )}
                  <div className="text-xs text-[var(--text-muted)] mt-1 italic">{editorialCaption(ans)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

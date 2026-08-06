"use client";

import { useMemo, useState } from "react";

// Shared game model (kept in page.tsx; duplicated type here for the client bundle).
export type Group = "learn" | "civics" | "think" | "coder" | "rules" | "older" | "little";
export type Game = {
  title: string;
  emoji: string;
  file: string;
  ages: string;
  blurb: string;
  group: Group;
  level: 1 | 2 | 3; // ⭐ starter · 🌟 skilled · 🚀 expert-capable
  topics: string[];
  retired?: boolean; // little-kids tier: archive only, not in the main browser
};

const LEVELS: { key: number; label: string; chip: string }[] = [
  { key: 3, label: "🚀 Expert", chip: "🚀" },
  { key: 2, label: "🌟 Skilled", chip: "🌟" },
  { key: 1, label: "⭐ Starter", chip: "⭐" },
];
const TOPICS: { key: string; label: string }[] = [
  { key: "maths", label: "🔢 Maths" },
  { key: "geography", label: "🌍 Geography" },
  { key: "sports", label: "⚽ Sports" },
  { key: "history-civics", label: "🏛️ History & Civics" },
  { key: "logic-coding", label: "🧠 Logic & Coding" },
  { key: "rules", label: "🟨 Be the Ref" },
  { key: "music", label: "🎵 Music" },
];
const GROUPS: { key: Group; title: string; sub: string }[] = [
  { key: "learn", title: "🌍 Learn & Play", sub: "Geography, history and the wider world, through real countries, empires and teams." },
  { key: "civics", title: "🏛️ Who Runs the Country?", sub: "Presidents, Prime Ministers, Kings and Queens, with real leaders from history." },
  { key: "think", title: "🔢 Count & Think", sub: "Place value, times tables, fractions, shapes, time and charts — the core four go up to 🚀 Expert." },
  { key: "coder", title: "🧠 Think Like a Coder", sub: "AND/OR/NOT logic, binary search, and the champion's gauntlet." },
  { key: "rules", title: "🟨 Be the Ref", sub: "Make the call and learn the rules of each sport." },
  { key: "older", title: "🎧 For older fans", sub: "Pitched at grown-ups and older kids." },
  { key: "little", title: "🧸 Little kids corner", sub: "The easiest games, kept for younger visitors." },
];

const navy = "#16324f";
const slate = "#5b7b97";

function levelChip(l: number) {
  return l === 3 ? "🚀" : l === 2 ? "🌟" : "⭐";
}

function Card({ g }: { g: Game }) {
  return (
    <a
      href={`/play/games/${g.file}`}
      style={{
        display: "block", textDecoration: "none", background: "#fff",
        border: "1px solid #e3edf5", borderRadius: 18, padding: 18,
        boxShadow: "0 6px 16px #16324f14", minWidth: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: "2.2rem" }}>{g.emoji}</div>
        <div style={{ fontSize: "1rem" }} aria-label="challenge level">{levelChip(g.level)}</div>
      </div>
      <div style={{ fontSize: "1.15rem", fontWeight: 800, color: navy, marginTop: 6 }}>{g.title}</div>
      <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#1f9e82", margin: "2px 0 6px" }}>
        Ages {g.ages}
      </div>
      <div style={{ fontSize: ".95rem", color: slate, lineHeight: 1.4 }}>{g.blurb}</div>
    </a>
  );
}

function Grid({ games }: { games: Game[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginTop: 14 }}>
      {games.map((g) => <Card key={g.file} g={g} />)}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none", cursor: "pointer", borderRadius: 999, padding: "8px 14px",
        fontWeight: 800, fontSize: ".9rem", fontFamily: "inherit",
        background: active ? navy : "#fff", color: active ? "#fff" : navy,
        boxShadow: active ? "0 3px 0 #0a1c2e" : "0 3px 0 #d7e6f2",
      }}
    >
      {children}
    </button>
  );
}

export default function PlayBrowser({ games }: { games: Game[] }) {
  const [level, setLevel] = useState<number | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const active = useMemo(() => games.filter((g) => !g.retired), [games]);
  const matches = useMemo(() => {
    return active
      .filter((g) => (level === null ? true : g.level === level))
      .filter((g) => (topic === null ? true : g.topics.includes(topic)))
      .sort((a, b) => b.level - a.level || a.title.localeCompare(b.title));
  }, [active, level, topic]);

  const surprise = () => {
    if (!matches.length) return;
    const g = matches[Math.floor(Math.random() * matches.length)];
    window.location.href = `/play/games/${g.file}`;
  };

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 40px", minWidth: 0 }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: navy, marginBottom: 6 }}>Play &amp; Learn</h1>
      <p style={{ color: slate, maxWidth: 680, lineHeight: 1.5 }}>
        Learning games built from our real data: countries and capitals, empires and leaders, teams and
        trophies, big numbers and the ideas behind coding. Pick your challenge, pick your topic, and play.
      </p>

      {/* filters */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: ".8rem", fontWeight: 800, color: slate, textTransform: "uppercase", letterSpacing: 1 }}>
          Challenge
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <Chip active={level === null} onClick={() => setLevel(null)}>All</Chip>
          {LEVELS.map((l) => (
            <Chip key={l.key} active={level === l.key} onClick={() => setLevel(level === l.key ? null : l.key)}>
              {l.label}
            </Chip>
          ))}
        </div>
        <div style={{ fontSize: ".8rem", fontWeight: 800, color: slate, textTransform: "uppercase", letterSpacing: 1, marginTop: 14 }}>
          Topic
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <Chip active={topic === null} onClick={() => setTopic(null)}>All</Chip>
          {TOPICS.map((t) => (
            <Chip key={t.key} active={topic === t.key} onClick={() => setTopic(topic === t.key ? null : t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: ".95rem", fontWeight: 700, color: slate }}>
            {matches.length} game{matches.length === 1 ? "" : "s"}
            {level !== null || topic !== null ? " match" : ""} · hardest first
          </span>
          <button
            onClick={surprise}
            style={{
              border: "none", cursor: "pointer", borderRadius: 999, padding: "8px 16px",
              fontWeight: 800, fontSize: ".9rem", fontFamily: "inherit",
              background: "#ff6b6b", color: "#fff", boxShadow: "0 3px 0 #d2453f",
            }}
          >
            🎲 Surprise me!
          </button>
        </div>
      </div>

      {matches.length ? (
        <Grid games={matches} />
      ) : (
        <p style={{ color: slate, marginTop: 20, fontWeight: 700 }}>
          No games match those filters yet — try a different combination.
        </p>
      )}

      {/* the classic sectioned view, collapsed */}
      <details style={{ marginTop: 34 }}>
        <summary
          style={{
            cursor: "pointer", fontSize: "1.15rem", fontWeight: 800, color: navy,
            background: "#fff", border: "1px solid #e3edf5", borderRadius: 14,
            padding: "14px 18px", boxShadow: "0 4px 12px #16324f10", listStylePosition: "inside",
          }}
        >
          📚 All games by section (the classic view)
        </summary>
        <div style={{ marginTop: 8 }}>
          {GROUPS.map((grp) => {
            const list = games.filter((g) => (g.retired ? grp.key === "little" : g.group === grp.key));
            if (!list.length) return null;
            return (
              <section key={grp.key}>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: navy, marginTop: 26, marginBottom: 0 }}>
                  {grp.title}
                </h2>
                <p style={{ color: slate, fontSize: ".92rem", margin: "4px 0 0" }}>{grp.sub}</p>
                <Grid games={list} />
              </section>
            );
          })}
        </div>
      </details>

      <a
        href="/play/arcade"
        style={{
          display: "block", marginTop: 34, textDecoration: "none", background: navy,
          color: "#fff", borderRadius: 18, padding: "18px 20px", boxShadow: "0 6px 16px #16324f22",
        }}
      >
        <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>For older fans: The Rules Labs &rarr;</div>
        <div style={{ fontSize: ".95rem", color: "#bcd4e6", marginTop: 4 }}>
          Go deeper on football, the NFL, cricket and baseball: the signature-rule labs, the full laws,
          real officiating calls, and how the rules changed. Kids and adults modes.
        </div>
      </a>
    </main>
  );
}

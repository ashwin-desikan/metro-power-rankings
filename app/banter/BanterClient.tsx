"use client";

/**
 * Beta tester client for the Banter Engine. All intelligence is server-side
 * (/api/banter): this component only renders the conversation, holds the
 * passphrase for the session, and offers voice input. Model output is always
 * rendered as text, never HTML.
 *
 * Styling follows DESIGN-STANDARDS.md: theme tokens from globals.css
 * (--bg-card / --border / --text-muted / --accent), JetBrains Mono for stamp
 * lines, standard page skeleton (breadcrumbs, header, mono as-of line),
 * phone-clean at 390px.
 */
import { useEffect, useRef, useState } from "react";

type ScenarioMeta = {
  id: string; label: string; dateLong: string; place: string;
  setting: string; chips: string[]; open: string;
};
type Msg = { role: "user" | "assistant"; content: string; slips?: string[] };

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

export default function BanterClient() {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [sc, setSc] = useState<ScenarioMeta | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recording, setRecording] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Browser password autofill can fill the field without firing React's onChange,
  // so at send time we trust the DOM value over component state.
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setKey(sessionStorage.getItem("banterKey") ?? "");
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setMicOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    fetch("/api/banter")
      .then((r) => r.json())
      .then((j: { detail: ScenarioMeta[] }) => {
        setScenarios(j.detail);
        pick(j.detail[0]);
      })
      .catch(() => setErr("Couldn't load scenarios — refresh to retry."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  function pick(s: ScenarioMeta) {
    setSc(s);
    setMsgs([{ role: "assistant", content: s.open }]);
    setErr("");
  }

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || busy || !sc) return;
    const liveKey = (keyRef.current?.value ?? key).trim();
    if (!liveKey) { setErr("Enter the beta passphrase first (the box below the header)."); return; }
    if (liveKey !== key) setKey(liveKey);
    sessionStorage.setItem("banterKey", liveKey);
    setBusy(true); setErr(""); setInput("");
    const history = [...msgs, { role: "user" as const, content: t }];
    setMsgs(history);
    try {
      const r = await fetch("/api/banter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: liveKey, scenario: sc.id, messages: history.slice(-12) }),
      });
      const j = (await r.json()) as { reply?: string; slips?: string[]; error?: string };
      if (!r.ok || !j.reply) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMsgs([...history, { role: "assistant", content: j.reply, slips: j.slips }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setMsgs(history.slice(0, -1));
      setInput(t);
    } finally {
      setBusy(false);
    }
  }

  function mic() {
    if (recording) { recRef.current?.stop(); return; }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-GB"; rec.interimResults = true; rec.continuous = false;
    const base = input ? input + " " : "";
    rec.onresult = (ev: SpeechEvent) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      setInput(base + t);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recRef.current = rec;
    setRecording(true);
    rec.start();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 min-w-0">
      {/* breadcrumbs */}
      <nav className="text-xs text-[var(--text-dim)]">
        <a href="/" className="hover:text-[var(--accent)]">Home</a>
        <span className="mx-1.5">/</span>
        <span className="text-[var(--text-muted)]">Banter</span>
      </nav>

      {/* header block */}
      <header className="mt-3">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          🍻 The Banter Engine
        </h1>
        <p className="mt-1 text-[15px] text-[var(--text-muted)] max-w-2xl">
          Pull up a stool in another time and place — or tonight — and argue sport, music and
          history with a local who only knows what was knowable that day.
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          Private beta · fictional characters · facts anchored to this site&apos;s dated data
        </p>
      </header>

      {/* passphrase */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          ref={keyRef}
          type="password" placeholder="beta passphrase" value={key}
          autoComplete="off" name="banter-beta-passphrase"
          onChange={(e) => setKey(e.target.value)}
          className="w-full sm:w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm
                     placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:outline-none"
        />
        <span className="text-xs text-[var(--text-dim)]">from your invite — one key per tester</span>
      </div>

      {/* scenario picker — phone: native select (twelve buttons would wall the
          viewport, and the standard caps nav rows at three); sm+: button grid */}
      <div className="mt-5 sm:hidden">
        <label
          htmlFor="scenePick"
          className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]"
          style={MONO}
        >
          Scene
        </label>
        <select
          id="scenePick"
          value={sc?.id ?? ""}
          onChange={(e) => {
            const s = scenarios.find((x) => x.id === e.target.value);
            if (s) pick(s);
          }}
          className="mt-1 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]
                     px-3 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="mt-5 hidden sm:flex flex-wrap gap-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => pick(s)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
              sc?.id === s.id
                ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-card)]"
                : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* scene card */}
      {sc && (
        <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--accent)]" style={MONO}>
            {sc.dateLong} · {sc.place}
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {sc.setting.charAt(0).toUpperCase() + sc.setting.slice(1)}.
          </p>
          <p className="mt-2 text-[11px] text-[var(--text-dim)]" style={MONO}>
            A fictional conversation with an AI character, anchored to real, dated facts. It can be
            wrong — that is half the fun.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {sc.chips.map((c) => (
              <button
                key={c}
                onClick={() => setInput(c)}
                className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs
                           text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]
                           cursor-pointer transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* conversation */}
      <div className="mt-5 flex min-h-[200px] flex-col gap-2.5">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`min-w-0 max-w-[85%] break-words rounded-xl border p-3 text-[15px] leading-relaxed ${
              m.role === "assistant"
                ? "self-start border-[var(--border)] bg-[var(--bg-card)]"
                : "self-end border-[var(--accent-dim)] bg-[var(--bg-card-hover)]"
            }`}
          >
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
              {m.role === "assistant" ? "The local" : "You"}
            </div>
            <div>{m.content}</div>
            {m.slips && m.slips.length > 0 && (
              <div
                className="mt-2 inline-block rounded-md border border-[#E2628B]/40 bg-[#E2628B]/10 px-2 py-0.5
                           text-[11px] text-[#E2628B]"
                style={MONO}
              >
                ⏳ time slip: {m.slips.join(", ")}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="text-sm italic text-[var(--text-dim)]">…thinking…</div>
        )}
        <div ref={endRef} />
      </div>

      {err && <p className="mt-2 text-sm text-[#E2628B]">{err}</p>}

      {/* composer */}
      <div className="mt-3 flex gap-2">
        {micOk && (
          <button
            onClick={mic}
            title="Tap to talk (audio may pass through your browser vendor's speech service)"
            className={`w-11 shrink-0 rounded-lg border text-lg cursor-pointer transition-colors ${
              recording
                ? "animate-pulse border-[#E2628B] bg-[#E2628B]/10 text-[#E2628B]"
                : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            🎙️
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Say something to the local…"
          className="min-h-[52px] min-w-0 flex-1 resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-card)]
                     p-3 text-[15px] placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          onClick={() => void send()}
          disabled={busy}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-4 sm:px-5 font-semibold text-black cursor-pointer
                     disabled:cursor-default disabled:opacity-40"
        >
          Send
        </button>
      </div>

      {/* how this works */}
      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-bold">How this works</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
          Each scene is locked to its date: the character&apos;s fact card is drawn from this site&apos;s
          dated data and carries nothing later, a linter rewinds replies that slip out of period, and
          anything after the scene&apos;s date is speculation by design. The &quot;today&quot; local knows
          recent events only as far as the site&apos;s data reaches. Conversations may be logged without
          content (sizes and timings only) to keep the beta healthy — please report anything odd or
          unpleasant.
        </p>
      </section>
    </main>
  );
}

/* Minimal ambient types for the Web Speech API (not in lib.dom for all TS versions). */
type SpeechRec = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((ev: SpeechEvent) => void) | null; onend: (() => void) | null;
  onerror: (() => void) | null; start: () => void; stop: () => void;
};
type SpeechEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

"use client";

/**
 * Beta tester client for the Banter Engine. All intelligence is server-side
 * (/api/banter): this component only renders the conversation, holds the
 * passphrase, and offers voice input. Model output is always rendered as
 * text, never HTML.
 *
 * Replies stream over SSE. The time lock can only be linted once a reply is
 * complete, so a slipped reply streams in, the server sends a `rewind` frame,
 * and the corrected reply streams in over the top — rendered here as the local
 * catching himself, which is the most on-brand moment in the product.
 *
 * Styling follows DESIGN-STANDARDS.md: theme tokens from globals.css
 * (--bg-card / --border / --text-muted / --accent), JetBrains Mono for stamp
 * lines, standard page skeleton (breadcrumbs, header, mono as-of line),
 * phone-clean at 390px.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type ScenarioMeta = {
  id: string; label: string; flag: string | null; dateLong: string; place: string;
  /** Present-day country, for the grouped picker. Server pre-sorts the list
   *  (countries by their newest scene, scenes by year descending), so the
   *  client only draws headers where the country changes. */
  country?: string | null;
  setting: string; chips: string[]; open: string;
  /** Why this moment matters. */
  hook?: string | null;
  /** Second-tier prompts, shown once the conversation has started. */
  deeperChips?: string[];
  /** What actually happened next. Revealed only on request, and never sent to
   *  the model — see the Scenario type in lib/banter/banterCore.ts. */
  epilogue?: { headline: string; body: string; gotWrong: string } | null;
};

/** Decorative country flag for a scene. flagcdn serves present-day flags, so
 *  the 1948 Washington scene shows fifty stars rather than forty-eight — it is
 *  a wayfinding cue on the picker, not a historical claim, hence aria-hidden
 *  and an empty alt. The 40x30 source rendered at 20x15 keeps it crisp on
 *  retina. Same idiom as /sound/charts. */
function Flag({ code }: { code: string | null }) {
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/40x30/${code}.png`}
      alt=""
      aria-hidden="true"
      width={20}
      height={15}
      className="rounded-[2px] flex-shrink-0"
      style={{ objectFit: "cover" }} loading="lazy" decoding="async"
    />
  );
}
/** Group the server-pre-sorted scene list into contiguous {country, items}
 *  runs. The API sorts countries by their newest scene and scenes by year
 *  descending, so a single pass suffices — no re-sorting client-side. */
function groupScenes(list: ScenarioMeta[]): { country: string; items: ScenarioMeta[] }[] {
  const out: { country: string; items: ScenarioMeta[] }[] = [];
  for (const s of list) {
    const c = s.country ?? "Elsewhere";
    const g = out[out.length - 1];
    if (g && g.country === c) g.items.push(s);
    else out.push({ country: c, items: [s] });
  }
  return out;
}
type Msg = {
  role: "user" | "assistant";
  content: string;
  slips?: string[];
  rewound?: string[];
  at?: number;
};
type Frame = { t: string; d?: string; slips?: string[]; error?: string };
type KeyState = "unknown" | "checking" | "ok" | "bad";

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const MAX_MSG = 800; // mirrors LIMITS.MAX_MSG in lib/banter/banterCore.ts

// The passphrase is a convenience credential for a ~20-person beta, so it lives
// in localStorage and survives the tab closing. It used to sit in
// sessionStorage, which meant testers retyped it every single visit; that read
// is kept as a one-time fallback so anyone mid-session keeps their key.
const KEY_STORE = "banterKey";
const THREAD_STORE = "banterThreads";

function readKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? sessionStorage.getItem(KEY_STORE) ?? "";
  } catch { return ""; }
}
function writeKey(v: string) { try { localStorage.setItem(KEY_STORE, v); } catch { /* private mode */ } }
function forgetKey() {
  try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE); }
  catch { /* private mode */ }
}
function readThreads(): Record<string, Msg[]> {
  try { return JSON.parse(sessionStorage.getItem(THREAD_STORE) ?? "{}") as Record<string, Msg[]>; }
  catch { return {}; }
}
function writeThreads(t: Record<string, Msg[]>) {
  try { sessionStorage.setItem(THREAD_STORE, JSON.stringify(t)); } catch { /* quota */ }
}
function clockOf(at: number | undefined): string {
  if (!at) return "";
  try {
    return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function BanterClient() {
  // Collapsed on every scene change and on "Start over": the reveal is the end
  // of a scene, so carrying it open into a fresh one would spoil the next
  // conversation before its first line.
  const [showEpilogue, setShowEpilogue] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [loadingScenes, setLoadingScenes] = useState(true);
  // Which country's scenes are expanded in the desktop picker, if any. The
  // full wall of scene buttons pushed the conversation two screens below the
  // fold, but a bare "change scene" link hid what there was to choose (both
  // Ashwin, 2026-08-20) — so every country stays visible as a chip and only
  // one country's scenes expand at a time. Picking a scene collapses it.
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);
  const [sc, setSc] = useState<ScenarioMeta | null>(null);
  // One thread per scenario. Switching scene used to wipe the conversation
  // with no warning; keeping them side by side means you can wander between
  // bars and come back to where you left off.
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState("");
  const [key, setKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [keyState, setKeyState] = useState<KeyState>("unknown");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(-1);
  const [recording, setRecording] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  // Bumped whenever a recognition session is abandoned. A late transcript from
  // a stopped session carries a stale token and is dropped — otherwise a result
  // landing just after send() refills the box with the message you just sent,
  // which is the "text lingers after Enter" bug in speaker mode.
  const recSeq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Browser password autofill can fill the field without firing React's
  // onChange, so at send time we trust the DOM value over component state.
  const keyRef = useRef<HTMLInputElement>(null);
  const probedRef = useRef("");

  const msgs: Msg[] = (sc && threads[sc.id]) || [];
  const showKeyField = editingKey || !keySaved;
  const blocked = busy || cooldown > 0;

  useEffect(() => {
    const k = readKey();
    setKey(k);
    setKeySaved(Boolean(k));
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setMicOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    const saved = readThreads();
    fetch("/api/banter")
      .then((r) => r.json())
      .then((j: { detail: ScenarioMeta[] }) => {
        setScenarios(j.detail);
        const seeded: Record<string, Msg[]> = {};
        for (const s of j.detail) {
          seeded[s.id] = saved[s.id]?.length ? saved[s.id] : [{ role: "assistant", content: s.open }];
        }
        setThreads(seeded);
        setSc(j.detail[0] ?? null);
      })
      .catch(() => setErr("Couldn't load scenarios. Refresh to retry."))
      .finally(() => setLoadingScenes(false));
  }, []);

  // Only follow the conversation once it IS a conversation. Scrolling on the
  // opening line alone landed phones at the very bottom of the page, with the
  // header, scene picker and scene card all above the fold and never seen.
  // block:"nearest" also stops the page being yanked when the end is already
  // visible on desktop.
  useEffect(() => {
    if (msgs.length <= 1) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sc?.id, msgs.length, busy]);

  useEffect(() => {
    if (Object.keys(threads).length) writeThreads(threads);
  }, [threads]);

  // Grow the composer with the message instead of making people drag a corner.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const stopRecording = useCallback(() => {
    recSeq.current += 1;
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }, []);

  function pick(s: ScenarioMeta) {
    stopRecording();
    setSc(s);
    setErr("");
    setPickerOpen(null);
    setShowEpilogue(false);
    setThreads((t) => (t[s.id]?.length ? t : { ...t, [s.id]: [{ role: "assistant", content: s.open }] }));
  }

  function restart() {
    if (!sc) return;
    stopRecording();
    setErr("");
    setInput("");
    setShowEpilogue(false);
    setThreads((t) => ({ ...t, [sc.id]: [{ role: "assistant", content: sc.open }] }));
  }

  async function copyMsg(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(-1), 1500);
    } catch { /* clipboard blocked */ }
  }

  /** Key-only check so a wrong passphrase surfaces on blur, not after you have
   *  typed a message and lost it to a 401. Skipped when the same value has
   *  already been probed, so tabbing in and out does not spend requests. */
  async function probeKey() {
    const k = (keyRef.current?.value ?? key).trim();
    if (!k || k === probedRef.current) return;
    probedRef.current = k;
    setKeyState("checking");
    try {
      const r = await fetch("/api/banter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: k, probe: true }),
      });
      if (r.ok) {
        writeKey(k);
        setKey(k); setKeySaved(true); setEditingKey(false); setKeyState("ok"); setErr("");
      } else if (r.status === 401) {
        setKeyState("bad");
        setErr("That's not the passphrase. Ask Ashwin.");
      } else {
        setKeyState("unknown"); // rate limited or not configured: say nothing
        probedRef.current = "";
      }
    } catch {
      setKeyState("unknown");
      probedRef.current = "";
    }
  }

  /** Post a history and stream the reply into a trailing assistant bubble.
   *  `restore` is the thread to put back if the call fails, so send() can take
   *  the user's message back out of the log while regenerate() leaves the
   *  conversation exactly as it was. */
  async function run(history: Msg[], liveKey: string, restore: Msg[], restoreInput?: string) {
    if (!sc) return;
    const sid = sc.id;
    setBusy(true); setErr("");
    setThreads((p) => ({ ...p, [sid]: history }));

    let acc = "";
    let rewound: string[] | undefined;
    const paint = (extra?: Partial<Msg>) =>
      setThreads((p) => ({
        ...p,
        [sid]: [...history, { role: "assistant", content: acc, rewound, at: Date.now(), ...extra }],
      }));

    try {
      const r = await fetch("/api/banter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: liveKey, scenario: sid, messages: history.slice(-12), stream: true }),
      });

      if (r.status === 429) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
        setCooldown(Math.max(1, Number(j.retryAfter) || 5));
        throw new Error(j.error ?? "Easy on, one at a time.");
      }

      const ctype = r.headers.get("content-type") ?? "";
      if (!r.ok || !r.body || !ctype.includes("text/event-stream")) {
        // Proxies and some browsers can strip streaming; fall back to the JSON
        // shape the route still serves.
        const j = (await r.json().catch(() => ({}))) as { reply?: string; slips?: string[]; error?: string };
        if (!r.ok || !j.reply) throw new Error(j.error ?? `HTTP ${r.status}`);
        acc = j.reply;
        paint({ slips: j.slips });
        setKeySaved(true); setKeyState("ok"); setEditingKey(false);
        return;
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let split: number;
        while ((split = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, split).trim();
          buf = buf.slice(split + 2);
          if (!frame.startsWith("data:")) continue;
          let ev: Frame;
          try { ev = JSON.parse(frame.slice(5).trim()) as Frame; } catch { continue; }
          if (ev.t === "delta") { acc += ev.d ?? ""; paint(); }
          else if (ev.t === "rewind") { rewound = ev.slips; acc = ""; paint(); }
          else if (ev.t === "done") paint({ slips: ev.slips });
          else if (ev.t === "error") throw new Error(ev.error ?? "The stream stopped short.");
        }
      }
      setKeySaved(true); setKeyState("ok"); setEditingKey(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setThreads((p) => ({ ...p, [sid]: restore }));
      if (restoreInput !== undefined) setInput(restoreInput);
    } finally {
      setBusy(false);
    }
  }

  async function send(text?: string) {
    const t = (text ?? input).trim().slice(0, MAX_MSG);
    if (!t || blocked || !sc) return;
    const liveKey = (keyRef.current?.value ?? key).trim();
    if (!liveKey) {
      setErr("Enter the beta passphrase first (the box below the header).");
      setEditingKey(true);
      return;
    }
    if (liveKey !== key) setKey(liveKey);
    writeKey(liveKey);
    // Kill any in-flight dictation BEFORE clearing the box, or its final
    // transcript lands afterwards and puts the sent text straight back.
    stopRecording();
    const before = msgs;
    setInput("");
    await run([...before, { role: "user", content: t, at: Date.now() }], liveKey, before, t);
  }

  async function regenerate() {
    if (blocked || !sc) return;
    const liveKey = (keyRef.current?.value ?? key).trim();
    if (!liveKey) return;
    const before = msgs;
    const trimmed = before[before.length - 1]?.role === "assistant" ? before.slice(0, -1) : before;
    if (!trimmed.length || trimmed[trimmed.length - 1].role !== "user") return;
    await run(trimmed, liveKey, before);
  }

  function mic() {
    if (recording) { stopRecording(); return; }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-GB"; rec.interimResults = true; rec.continuous = false;
    const seq = ++recSeq.current;
    const base = input ? input + " " : "";
    rec.onresult = (ev: SpeechEvent) => {
      if (recSeq.current !== seq) return; // stale session: message already sent
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      setInput((base + t).slice(0, MAX_MSG));
    };
    rec.onend = () => { if (recSeq.current === seq) setRecording(false); };
    rec.onerror = () => { if (recSeq.current === seq) setRecording(false); };
    recRef.current = rec;
    setRecording(true);
    rec.start();
  }

  const lastIdx = msgs.length - 1;

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
          Pull up a stool in another time and place, or tonight, and argue sport, music and
          history with a local who only knows what was knowable that day.
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          Private beta · fictional characters · facts anchored to this site&apos;s dated data
        </p>
      </header>

      {/* passphrase — checked on blur, then collapsed to a one-line
          confirmation so the field stops occupying the top of every visit */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {showKeyField ? (
          <>
            <input
              ref={keyRef}
              type="password" placeholder="beta passphrase" value={key}
              autoComplete="off" name="banter-beta-passphrase" aria-label="Beta passphrase"
              aria-invalid={keyState === "bad"}
              onChange={(e) => { setKey(e.target.value); setKeyState("unknown"); }}
              onBlur={() => void probeKey()}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void probeKey(); taRef.current?.focus(); } }}
              className={`w-full sm:w-56 rounded-lg border bg-[var(--bg-card)] px-3 py-2 text-sm
                          placeholder:text-[var(--text-dim)] focus:outline-none ${
                keyState === "bad"
                  ? "border-[#E2628B] focus:border-[#E2628B]"
                  : "border-[var(--border)] focus:border-[var(--accent)]"
              }`}
            />
            <span className="text-xs text-[var(--text-dim)]">
              {keyState === "checking"
                ? "checking…"
                : keyState === "bad"
                  ? "not recognised, check your invite"
                  : "from your invite, saved on this device so you only enter it once"}
            </span>
          </>
        ) : (
          <>
            <span className="text-xs text-[var(--text-muted)]" style={MONO}>
              ✓ passphrase saved on this device
            </span>
            <button
              onClick={() => { setEditingKey(true); setKeyState("unknown"); setTimeout(() => keyRef.current?.focus(), 0); }}
              className="text-xs text-[var(--text-dim)] underline underline-offset-2 hover:text-[var(--accent)] cursor-pointer"
            >
              change
            </button>
            <button
              onClick={() => { forgetKey(); setKey(""); setKeySaved(false); setEditingKey(true); probedRef.current = ""; }}
              className="text-xs text-[var(--text-dim)] underline underline-offset-2 hover:text-[var(--accent)] cursor-pointer"
            >
              forget
            </button>
          </>
        )}
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
          {groupScenes(scenarios).map((g) => (
            <optgroup key={g.country} label={g.country}>
              {g.items.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="mt-5 hidden sm:block">
        {/* Every country stays visible as a one-row strip of chips (Ashwin:
            hiding the list behind "change scene" hid what there was to
            choose). Only the tapped country's scenes expand below it, so the
            engine stays inside the first viewport either way. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
            Scene
          </span>
          {groupScenes(scenarios).map((g) => {
            const active = g.items.some((s) => s.id === sc?.id);
            const open = pickerOpen === g.country;
            return (
              <button
                key={g.country}
                onClick={() => setPickerOpen(open ? null : g.country)}
                aria-expanded={open}
                title={g.items.map((s) => s.label).join(" · ")}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                  open
                    ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-card)]"
                    : active
                      ? "border-[var(--accent)] bg-[var(--bg-card)]"
                      : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
                }`}
              >
                <Flag code={g.items[0]?.flag ?? null} />
                <span>{g.country}</span>
                {g.items.length > 1 && (
                  <span className="text-[var(--text-dim)]" style={MONO}>{g.items.length}</span>
                )}
              </button>
            );
          })}
        </div>
        {groupScenes(scenarios)
          .filter((g) => g.country === pickerOpen)
          .map((g) => (
            <div key={g.country} className="mt-2 rounded-xl border border-[var(--border)] p-3">
              <div className="grid gap-2 lg:grid-cols-2">
                {g.items.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pick(s)}
                      aria-current={sc?.id === s.id ? "true" : undefined}
                      title={s.hook ?? undefined}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                        sc?.id === s.id
                          ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-card)]"
                          : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0"><Flag code={s.flag} /></span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span>{s.label}</span>
                          {(threads[s.id]?.length ?? 0) > 1 && (
                            <span className="text-[var(--text-dim)]" title="conversation in progress">·</span>
                          )}
                        </span>
                        {/* The stake, on the picker itself. This is the whole of the
                            original complaint: the label says where and when, never why,
                            so half the scenes gave a reader nothing to open with. */}
                        {s.hook && (
                          <span className="mt-0.5 block text-xs font-normal leading-snug text-[var(--text-dim)]">
                            {s.hook}
                          </span>
                        )}
                      </span>
                    </button>
                ))}
              </div>
            </div>
          ))}
      </div>
      {loadingScenes && <p className="mt-5 text-sm text-[var(--text-dim)]">Opening up…</p>}

      {/* scene card */}
      {sc && (
        <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--accent)]" style={MONO}>
                <Flag code={sc.flag} />
                <span>{sc.dateLong} · {sc.place}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {sc.setting.charAt(0).toUpperCase() + sc.setting.slice(1)}.
              </p>
              {/* The stake. A reader who cannot tell why a moment matters does
                  not know what to ask, and runs out after two questions. */}
              {sc.hook && (
                <p className="mt-1.5 text-sm text-[var(--text)]">{sc.hook}</p>
              )}
            </div>
            {msgs.length > 1 && (
              <button
                onClick={restart}
                className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]
                           hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors"
              >
                Start over
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-dim)]" style={MONO}>
            A fictional conversation with an AI character, anchored to real, dated facts. It can be
            wrong. That is half the fun.
          </p>
          {/* Openers always; the second tier appears once the conversation has
              actually started, which is precisely when the first five run out.
              Concatenated rather than shown as a separate row so it reads as
              the same well getting deeper, not a new control to learn. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...sc.chips, ...(msgs.length > 1 ? sc.deeperChips ?? [] : [])].map((c) => (
              <button
                key={c}
                onClick={() => void send(c)}
                disabled={blocked}
                className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs
                           text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]
                           cursor-pointer transition-colors disabled:cursor-default disabled:opacity-40"
              >
                {c}
              </button>
            ))}
          </div>

          {/* What happened next.
              The character's ignorance of the future is the point of this
              feature and is not being loosened. The problem it created is that
              the payoff was unreachable: you can argue with a 1948 stringer
              about Dewey all afternoon and never get the front page. So the
              reveal lives out here, outside the conversation, in the reader's
              own century — and only after they have actually talked, so it
              cannot be read before the scene has had its go. */}
          {sc.epilogue && msgs.length > 1 && (
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              {!showEpilogue ? (
                <button
                  onClick={() => setShowEpilogue(true)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)]
                             hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors"
                >
                  What happened next →
                </button>
              ) : (
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
                    From here, looking back
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-[var(--text)]">{sc.epilogue.headline}</p>
                  <p className="mt-1.5 text-sm text-[var(--text-muted)]">{sc.epilogue.body}</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    <span className="text-[var(--text-dim)]">What the room had wrong: </span>
                    {sc.epilogue.gotWrong}
                  </p>
                  <button
                    onClick={() => setShowEpilogue(false)}
                    className="mt-2.5 text-xs text-[var(--text-dim)] hover:text-[var(--accent)] cursor-pointer"
                  >
                    Hide
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* conversation */}
      <div
        className="mt-5 flex min-h-[200px] flex-col gap-2.5"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {msgs.map((m, i) => {
          const streaming = busy && i === lastIdx && m.role === "assistant";
          return (
            <div
              key={i}
              className={`min-w-0 max-w-[85%] break-words rounded-xl border p-3 text-[15px] leading-relaxed ${
                m.role === "assistant"
                  ? "self-start border-[var(--border)] bg-[var(--bg-card)]"
                  : "self-end border-[var(--accent-dim)] bg-[var(--bg-card-hover)]"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
                <span>{m.role === "assistant" ? "The local" : "You"}</span>
                {m.at && <span className="normal-case tracking-normal opacity-70">{clockOf(m.at)}</span>}
              </div>
              {m.rewound && m.rewound.length > 0 && (
                <div
                  className="mb-2 inline-block rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5
                             text-[11px] text-[var(--accent)]"
                  style={MONO}
                  title="The reply mentioned something that had not happened yet, so he started again."
                >
                  ⏮ he caught himself ({m.rewound.join(", ")})
                </div>
              )}
              <div className="whitespace-pre-wrap">
                {m.content}
                {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
              </div>
              {m.slips && m.slips.length > 0 && (
                <div
                  className="mt-2 inline-block rounded-md border border-[#E2628B]/40 bg-[#E2628B]/10 px-2 py-0.5
                             text-[11px] text-[#E2628B]"
                  style={MONO}
                >
                  ⏳ time slip: {m.slips.join(", ")}
                </div>
              )}
              {m.role === "assistant" && !streaming && m.content && (
                <div className="mt-2 flex gap-2 text-[11px] text-[var(--text-dim)]" style={MONO}>
                  <button
                    onClick={() => void copyMsg(i, m.content)}
                    className="hover:text-[var(--accent)] cursor-pointer transition-colors"
                  >
                    {copied === i ? "copied" : "copy"}
                  </button>
                  {i === lastIdx && i > 0 && (
                    <button
                      onClick={() => void regenerate()}
                      disabled={blocked}
                      className="hover:text-[var(--accent)] cursor-pointer transition-colors
                                 disabled:cursor-default disabled:opacity-40"
                    >
                      try that again
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {busy && msgs[lastIdx]?.role !== "assistant" && (
          <div className="self-start rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
              The local
            </div>
            <div className="flex gap-1" aria-label="Typing">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-dim)] [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-dim)] [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-dim)]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {err && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#E2628B]" role="alert">
          <span>{err}</span>
          {cooldown > 0 && <span className="text-[var(--text-dim)]">back in {cooldown}s</span>}
          {input.trim() && cooldown === 0 && !busy && (
            <button
              onClick={() => void send()}
              className="rounded-md border border-[#E2628B]/50 px-2 py-0.5 text-xs cursor-pointer
                         hover:bg-[#E2628B]/10 transition-colors"
            >
              Try again
            </button>
          )}
        </p>
      )}

      {/* composer */}
      <div className="mt-3 flex items-end gap-2">
        {micOk && (
          <button
            onClick={mic}
            disabled={blocked}
            aria-label={recording ? "Stop dictating" : "Dictate a message"}
            aria-pressed={recording}
            title="Tap to talk (audio may pass through your browser vendor's speech service)"
            className={`h-[52px] w-11 shrink-0 rounded-lg border text-lg cursor-pointer transition-colors
                        disabled:cursor-default disabled:opacity-40 ${
              recording
                ? "animate-pulse border-[#E2628B] bg-[#E2628B]/10 text-[#E2628B]"
                : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            🎙️
          </button>
        )}
        <textarea
          ref={taRef}
          value={input}
          rows={1}
          maxLength={MAX_MSG}
          aria-label="Message"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={
            cooldown > 0
              ? `Steady on, back in ${cooldown}s`
              : recording ? "Listening…" : "Say something to the local…"
          }
          className="min-h-[52px] min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-[var(--border)]
                     bg-[var(--bg-card)] p-3 text-[15px] placeholder:text-[var(--text-dim)]
                     focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          onClick={() => void send()}
          disabled={blocked || !input.trim()}
          className="h-[52px] shrink-0 rounded-lg bg-[var(--accent)] px-4 sm:px-5 font-semibold text-black cursor-pointer
                     disabled:cursor-default disabled:opacity-40"
        >
          {cooldown > 0 ? `${cooldown}s` : "Send"}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-dim)]" style={MONO}>
        <span>Enter to send · Shift+Enter for a new line</span>
        {input.length > MAX_MSG - 150 && <span>{MAX_MSG - input.length} left</span>}
      </div>

      {/* how this works */}
      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-bold">How this works</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
          Each scene is locked to its date: the character&apos;s fact card is drawn from this site&apos;s
          dated data and carries nothing later, a linter rewinds replies that slip out of period, and
          anything after the scene&apos;s date is speculation by design. When you see &quot;he caught
          himself&quot;, that is the linter catching a reply mid-flow and making him start again. The
          &quot;today&quot; local knows recent events only as far as the site&apos;s data reaches. Your
          passphrase is stored on this device only; conversations stay in this browser tab and are not
          saved to the server. Conversations may be logged without content (sizes and timings only) to
          keep the beta healthy. Please report anything odd or unpleasant.
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

/* scoring.js — the "Honest Answer" scoring model, shared by every Play & Learn game.
   Added 2026-08-30 per PLAY-MASTERY-SPEC.md §1.

   WHY THIS EXISTS. Until now every game let a wrong answer cost nothing: the round
   would not advance until the answer was right, and the celebration, the passport
   stamp, the revealed fact and the finale were identical whether the player knew
   the answer or found it on the fourth tap. That makes tapping-until-green the
   rational strategy in 2- and 3-option games, and memorising the finite pool the
   rational strategy in 4-option games. Understanding never wins because it is
   never the cheapest path to the confetti.

   THE CORRECTION IS NOT PUNISHMENT. It is a change to what gets celebrated:
   first-try knowledge and newly-learned facts, as two visibly different things,
   with a lucky tap celebrated as neither. A miss is never a dead end. The player
   still gets the fact, still gets a warm line, and can convert grey to gold in
   the same sitting via "Play the ones I missed".

   USAGE (bespoke shells)
     Scoring.init({ slug: "us-or-uk", total: 12, fastMs: 2500 });
     Scoring.beginRound(itemId);          // arms the deadzone, starts the clock
     if (!Scoring.armed()) return;        // guard inside your click handler
     var r = Scoring.answer(isCorrect);   // -> { tier, ms, correct }
     Scoring.paintPassport("pass", idx, stampChar);
     Scoring.finale({ mountId: "finale", ... });

   No dependencies. No build step. Safe in file:// and on the live site.
*/
window.Scoring = (function () {
  "use strict";

  var DEADZONE_MS = 350;   // §1.3 — a leftover tap from the previous round must not answer this one
  var FAST_MS     = 2500;  // §1.4 — provisional. Recalibrate from the player's own distribution.
  var KEY_PREFIX  = "cofn:play:v1:";

  var S = {
    slug: "", total: 0, fastMs: FAST_MS,
    t0: 0, armedAt: 0, answered: false, currentId: null,
    rounds: []   // { id, label, tier, ms }
  };

  /* ---------- item identity -------------------------------------------------
     Pools do not carry stable IDs yet (spec §1.7 asks the Python builders to
     emit them). Until they do, hash the question text: same string, same id,
     so mastery tracking works today with no pipeline change. */
  function hash(str) {
    var h = 5381, i;
    str = String(str == null ? "" : str);
    for (i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return "h" + (h >>> 0).toString(36);
  }
  function idOf(item) {
    if (!item) return "h0";
    if (item.id) return String(item.id);
    return hash((item.q || item.t || item.txt || "") + "|" + (item.place || item.comp || ""));
  }

  /* ---------- mastery store (localStorage) ---------------------------------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY_PREFIX + S.slug) || "{}") || {}; }
    catch (e) { return {}; }   // private mode, blocked storage, corrupt JSON
  }
  function save(map) {
    try { localStorage.setItem(KEY_PREFIX + S.slug, JSON.stringify(map)); } catch (e) {}
  }
  function record(id, tier, ms) {
    if (!id) return;
    var m = load(), r = m[id] || { n: 0, g: 0, miss: false, ms: 0, t: 0 };
    r.n = (r.n || 0) + 1;
    if (tier === "gold")      { r.g = (r.g || 0) + 1; r.miss = false; }
    else if (tier === "silver") { r.g = 0;            r.miss = false; }
    else                        { r.g = 0;            r.miss = true;  }
    r.ms = ms; r.t = Date.now();
    m[id] = r; save(m);
  }

  /* ---------- Leitner weighting (§1.7) --------------------------------------
     Unseen and just-missed items come back often. Twice-gold items go quiet for
     a week. This is the cheapest anti-memorisation lever available and it works
     inside the existing fixed pools. */
  function weightFor(rec) {
    if (!rec || !rec.n) return 3.0;                       // never seen
    if (rec.miss)       return 3.0;                       // missed last time
    var days = (Date.now() - (rec.t || 0)) / 86400000;
    if (rec.g >= 2)     return days < 7 ? 0.05 : 0.3;     // secure — suppress for a week
    if (rec.g === 1)    return 1.0;
    return 2.0;                                           // silver
  }

  /* Weighted sample without replacement. Falls back to a plain shuffle if the
     store is empty, so a first-ever run behaves exactly as before. */
  function weightedSample(pool, n, idFn) {
    idFn = idFn || idOf;
    var m = load(), items = pool.slice(), out = [], i, total, r, pick;
    var w = items.map(function (it) { return weightFor(m[idFn(it)]); });
    n = Math.min(n, items.length);
    for (i = 0; i < n; i++) {
      total = w.reduce(function (a, b) { return a + b; }, 0);
      if (total <= 0) { out = out.concat(shuffle(items).slice(0, n - out.length)); break; }
      r = Math.random() * total; pick = 0;
      while (pick < w.length - 1 && r > w[pick]) { r -= w[pick]; pick++; }
      out.push(items[pick]); items.splice(pick, 1); w.splice(pick, 1);
    }
    return out;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }


  /* ---------- self-injected tier styles -------------------------------------
     27 of the 41 games are self-contained shells that do NOT load
     assets/styles.css. Rather than hand-copy the tier CSS into each one (and
     have it drift), scoring.js ships it. Only NEW class names are defined, so
     a shell's own rules always win, and the values work against both stamp
     bases in the arcade: the shared .stamp (dashed outline) and the bespoke
     .stamp (opacity .4 + grayscale). */
  function injectStyles() {
    if (document.getElementById("scoring-css")) return;
    var css = [
      ".stamp.silver,.slot.silver,.dot.silver{opacity:1;filter:none;background:#dfe9f3;border-style:solid;border-color:#9fb6ca;box-shadow:inset 0 0 0 3px #9fb6ca;animation:pop .4s}",
      ".stamp.miss,.slot.miss,.dot.miss{opacity:1;filter:none;background:#fff7e6;border-style:solid;border-color:#e8c86a;box-shadow:inset 0 0 0 3px #e8c86a;animation:pop .4s}",
      ".opt.shown,.club.shown,.marker.shown{outline:3px dashed #17a88c;outline-offset:-6px}",
      ".opt.picked,.club.picked,.marker.picked{opacity:.5}",
      ".tally{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:10px 0;font-size:1rem;letter-spacing:normal}",
      ".tally .tl{background:#ffffffdd;border-radius:14px;padding:8px 12px;font-weight:800;font-size:.98rem;color:#16324f;letter-spacing:normal;white-space:nowrap;box-shadow:0 3px 0 #00000012}",
      ".tally .tl b{font-size:1.12rem}",
      ".learned{background:#fff7e6;border-radius:16px;padding:12px 14px;margin:10px auto;text-align:left;max-width:430px;font-size:1rem;letter-spacing:normal}",
      ".learned .lh{font-weight:900;color:#7a5b00;margin-bottom:4px;letter-spacing:normal}",
      ".learned ul{margin:0;padding-left:20px}",
      ".learned li{font-weight:700;color:#7a5b00;line-height:1.35;margin:3px 0;letter-spacing:normal}"
    ].join("\n");
    var st = document.createElement("style");
    st.id = "scoring-css"; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectStyles);
  else injectStyles();

  /* ---------- round lifecycle ----------------------------------------------- */
  function init(cfg) {
    cfg = cfg || {};
    S.slug   = cfg.slug || "game";
    S.total  = cfg.total || 0;
    S.fastMs = cfg.fastMs || FAST_MS;
    /* Bespoke shells carry their own CSS, so the tier -> class map is
       configurable. Defaults match assets/styles.css. */
    S.cls = cfg.stampClasses || { base: "stamp", gold: "got", silver: "silver", grey: "miss" };
    S.noun = cfg.noun || "thing";   // "1 new thing learned" / "1 new rhythm learned"
    S.rounds = [];
    return S;
  }
  function beginRound(id, label) {
    S.currentId = id || null;
    S.currentLabel = label || "";
    S.answered = false;
    S.t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    S.armedAt = S.t0 + DEADZONE_MS;
  }
  /* Call when "Read it to me" starts and ends, so the clock measures thinking
     time rather than listening time. Several players lean on the read-aloud. */
  function readStarted() { S.reading = true; }
  function readEnded() {
    S.reading = false;
    S.t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    S.armedAt = S.t0 + DEADZONE_MS;
  }
  function armed() {
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    return !S.answered && !S.reading && now >= S.armedAt;
  }
  function answer(correct) {
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var ms  = Math.max(0, Math.round(now - S.t0));
    var tier = correct ? (ms < S.fastMs ? "gold" : "silver") : "grey";
    S.answered = true;
    S.rounds.push({ id: S.currentId, label: S.currentLabel, tier: tier, ms: ms });
    record(S.currentId, tier, ms);
    return { tier: tier, ms: ms, correct: !!correct };
  }
  function answered() { return S.answered; }

  /* Some games are not multiple choice and are not graded on speed: Rhythm Echo
     scores on how close each tap is to the beat. They set the tier directly so
     the mastery store records what actually happened, rather than a latency
     reading that means nothing for that mechanic. */
  function answerTier(tier) {
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var ms = Math.max(0, Math.round(now - S.t0));
    S.answered = true;
    S.rounds.push({ id: S.currentId, label: S.currentLabel, tier: tier, ms: ms });
    record(S.currentId, tier, ms);
    return { tier: tier, ms: ms, correct: tier !== "grey" };
  }

  /* ---------- passport (§1.2) -----------------------------------------------
     Gold = knew it. Silver = worked it out. Grey = learned it just now.
     The player already reads the passport, so this is where the signal belongs. */
  function paintPassport(elId, upToIdx, stampFn) {
    var el = document.getElementById(elId); if (!el) return;
    el.innerHTML = "";
    for (var k = 0; k < S.total; k++) {
      var d = document.createElement("div"), r = S.rounds[k];
      d.className = S.cls.base + (r ? " " + S.cls[r.tier] : "");
      d.textContent = r ? (r.tier === "grey" ? "🆕" : (typeof stampFn === "function" ? stampFn(k) : (stampFn || "⭐"))) : "";
      d.title = r ? ({ gold: "Knew it", silver: "Worked it out", grey: "Learned it" })[r.tier] : "";
      el.appendChild(d);
    }
  }

  function tally() {
    var t = { gold: 0, silver: 0, grey: 0, missed: [] };
    S.rounds.forEach(function (r) {
      t[r.tier]++;
      if (r.tier === "grey") t.missed.push(r);
    });
    return t;
  }

  /* ---------- honest finale (§1.5) ------------------------------------------
     The headline is always "you learned N new things", never "you got N wrong".
     No ranking, no streak that can be broken (§6). */
  function finaleHTML() {
    var t = tally(), h = "";
    h += '<div class="tally">';
    if (t.gold)   h += '<div class="tl"><b>⭐ ' + t.gold + '</b> first time</div>';
    if (t.silver) h += '<div class="tl"><b>👍 ' + t.silver + '</b> worked out</div>';
    if (t.grey)   h += '<div class="tl"><b>🆕 ' + t.grey + '</b> new ' + S.noun + (t.grey > 1 ? "s" : "") + ' learned</div>';
    h += "</div>";
    if (t.missed.length) {
      h += '<div class="learned"><div class="lh">You learned:</div><ul>';
      t.missed.forEach(function (r) { h += "<li>" + esc(r.label || "a new one") + "</li>"; });
      h += "</ul></div>";
    }
    return h;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function headline() {
    var t = tally();
    if (t.grey === 0 && t.silver === 0) return "🏆 You knew every single one!";
    if (t.grey === 0) return "🏆 All correct, first try!";
    if (t.grey === 1) return "⭐ You learned a new " + S.noun + "!";
    return "⭐ You learned " + t.grey + " new " + S.noun + "s!";
  }

  function missedIndexes() {
    var out = [];
    S.rounds.forEach(function (r, i) { if (r.tier === "grey") out.push(i); });
    return out;
  }
  function reset() { S.rounds = []; S.answered = false; }

  return {
    init: init, beginRound: beginRound, armed: armed, answer: answer, answerTier: answerTier, answered: answered,
    readStarted: readStarted, readEnded: readEnded,
    paintPassport: paintPassport, tally: tally, finaleHTML: finaleHTML, headline: headline,
    missedIndexes: missedIndexes, reset: reset,
    tierClass: function (tier) { return tier ? S.cls[tier] : ""; },
    weightedSample: weightedSample, idOf: idOf, shuffle: shuffle,
    _state: S
  };
})();

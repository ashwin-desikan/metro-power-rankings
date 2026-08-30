/* vq-engine.js — the VISUAL variant of the shared MCQ engine (engine.js fork).
   Adds three optional pool-item fields: `vis` (HTML rendered in the #vis pane:
   letter tiles, number trains, character cards), `tile` (big centred option
   tiles instead of full-width rows) and `say` (TTS override so the read-aloud
   can spell letters / read digits the visual pane shows). Everything else is
   identical to engine.js and MUST be kept in sync with it.

   2026-08-30 — Honest Answer loop, per PLAY-MASTERY-SPEC.md §1. Requires
   assets/scoring.js to be loaded first. The old loop let a wrong answer cost
   nothing and would not advance until the answer was right, which made tapping
   until green the rational strategy. Now: one answer per round, the correct
   answer is revealed on a miss (with the fact, so a miss still teaches), stamps
   are gold / silver / newly-learned, and the finale reports what was actually
   learned. Sampling is Leitner-weighted so secure items go quiet for a week. */
(function () {
  "use strict";
  var G = window.GAME || {};
  var BASE = G.BASE, HEADER = G.HEADER || {}, POOL = G.POOL || [], PICK = G.POOL_PICK || 8;
  var $ = function (id) { return document.getElementById(id); };
  var i = 0, soundOn = true, actx = null, retryMode = false;
  var SLUG = (location.pathname.split("/").pop() || "game").replace(/\.html?$/, "");

  function sample(arr, n) { var a = arr.slice(); for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = a[k]; a[k] = a[j]; a[j] = t; } return a.slice(0, Math.min(n, a.length)); }

  /* Level ramp (2026-08-06): pools may tag items with a numeric `lvl`.
     When present, sampling is stratified across levels and the run is ordered
     easy -> hard. Pools without `lvl` behave exactly as before.
     2026-08-30: within each stratum the draw is now Leitner-weighted (spec §1.7)
     so unseen and just-missed items surface and twice-known items rest. */
  function draw(arr, n) {
    return (window.Scoring && Scoring.weightedSample) ? Scoring.weightedSample(arr, n) : sample(arr, n);
  }
  function pickStops() {
    var hasLvl = false, byLvl = {}, k;
    for (k = 0; k < POOL.length; k++) { if (POOL[k].lvl != null) { hasLvl = true; break; } }
    if (!hasLvl) return draw(POOL, PICK);
    POOL.forEach(function (x) { var l = x.lvl || 0; (byLvl[l] = byLvl[l] || []).push(x); });
    var keys = Object.keys(byLvl).map(Number).sort(function (a, b) { return a - b; });
    var per = Math.floor(PICK / keys.length), extra = PICK - per * keys.length, out = [];
    keys.forEach(function (l, i) {
      var want = per + (i >= keys.length - extra ? 1 : 0);
      out = out.concat(draw(byLvl[l], want));
    });
    if (out.length < PICK) {
      var rest = POOL.filter(function (x) { return out.indexOf(x) < 0; });
      out = out.concat(draw(rest, PICK - out.length));
    }
    out.sort(function (a, b) { return (a.lvl || 0) - (b.lvl || 0); });
    return out.slice(0, Math.min(PICK, out.length));
  }
  var STOPS = pickStops();
  Scoring.init({ slug: SLUG, total: STOPS.length });

  function tone(freq, dur, type, when, gain) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "sine"; o.frequency.value = freq; g.gain.value = gain || 0.12;
      o.connect(g); g.connect(actx.destination);
      var t = actx.currentTime + (when || 0);
      o.start(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.stop(t + dur);
    } catch (e) {}
  }
  function cheer() { [523, 659, 784, 1047].forEach(function (f, k) { tone(f, 0.25, "triangle", k * 0.09, 0.14); }); }
  /* A miss gets a warm rising two-note chime, NOT a buzzer. Spec §6: nothing in
     this loop is allowed to read as failure. */
  function learn() { [392, 523].forEach(function (f, k) { tone(f, 0.22, "triangle", k * 0.11, 0.11); }); }

  function speak(txt, onDone) {
    if (!("speechSynthesis" in window)) { if (onDone) onDone(); return; }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(txt); u.rate = 0.92; u.pitch = 1.12;
    if (onDone) u.onend = onDone;
    speechSynthesis.speak(u);
  }
  function confetti() {
    var cols = ["#ffd23f", "#34d3b0", "#ff6b6b", "#7fd1ff", "#a7f0a0"];
    for (var k = 0; k < 26; k++) { var c = document.createElement("div"); c.className = "confetti"; c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[k % cols.length]; c.style.animation = "fall " + (1.1 + Math.random() * 0.9) + "s ease-in " + (Math.random() * 0.2) + "s forwards"; c.style.opacity = 0; document.body.appendChild(c); (function (el) { setTimeout(function () { el.remove(); }, 2400); })(c); }
  }
  function buildPassport() { Scoring.paintPassport("passport", i, function (k) { return (STOPS[k] || {}).stamp || "⭐"; }); }

  function render() {
    var s = STOPS[i];
    Scoring.beginRound(Scoring.idOf(s), s.q);
    $("scene").style.background = s.bg;
    var _c = $("city"); _c.textContent = "";
    if (s.logo) { var _im = document.createElement("img"); _im.className = "crest"; _im.src = s.logo; _im.alt = s.place || ""; _im.onerror = function () { _c.textContent = s.city || ""; }; _c.appendChild(_im); } else { _c.textContent = s.city; }
    $("flag").textContent = s.flag || "";
    $("place").firstChild.textContent = s.place; $("sub").textContent = s.sub; $("q").textContent = s.q;
    var _v = $("vis"); if (_v) { _v.innerHTML = s.vis || ""; _v.style.display = s.vis ? "" : "none"; }
    $("toast").textContent = ""; $("reveal").className = "reveal"; $("next").className = "next";
    var o = $("opts"); o.innerHTML = ""; o.className = "opts" + (s.tile ? " tiles" : "");
    var order = s.opts.map(function (x, k) { return k; });
    for (var a = order.length - 1; a > 0; a--) { var b = Math.floor(Math.random() * (a + 1)); var t = order[a]; order[a] = order[b]; order[b] = t; }
    order.forEach(function (idx) {
      var opt = s.opts[idx]; var btn = document.createElement("button"); btn.className = "opt";
      btn.setAttribute("data-idx", idx);
      btn.innerHTML = (opt.logo ? '<img class="crest" src="' + opt.logo + '" alt="" onerror="this.style.display=&#39;none&#39;">' : (opt.e ? '<span class="em">' + opt.e + '</span>' : '')) + '<span>' + opt.t + '</span>';
      btn.onclick = function () { choose(btn, idx === s.ans); }; o.appendChild(btn);
    });
    buildPassport();
  }

  /* §1.1 One answer per round. §1.3 the deadzone is inside Scoring.armed(), so a
     tap carried over from the previous round cannot spend the answer. */
  function choose(btn, correct) {
    if (Scoring.answered() || !Scoring.armed()) return;
    var res = Scoring.answer(correct), s = STOPS[i];

    document.querySelectorAll(".opt").forEach(function (b) {
      var idx = +b.getAttribute("data-idx");
      if (idx === s.ans) b.classList.add(correct ? "right" : "shown");
      else if (b === btn) b.classList.add("picked");
      else b.classList.add("dim");
    });

    if (correct) {
      $("toast").textContent = res.tier === "gold" ? "🌟 You knew it!" : "👍 Worked it out!";
      cheer(); confetti();
    } else {
      /* A miss still teaches: the correct answer is shown and the fact is read
         out exactly as it would have been. Only the stamp and the tally differ. */
      $("toast").textContent = "🆕 Now you know it!";
      learn();
    }

    $("fact").textContent = s.fact;
    if (s.url) { $("golink").style.display = "inline-block"; $("golink").href = s.url; $("golink").textContent = s.linkLabel || "See on the site →"; }
    else { $("golink").style.display = "none"; }
    $("reveal").className = "reveal show";
    buildPassport();
    $("next").textContent = i === STOPS.length - 1 ? "See my stamps →" : "Next →";
    $("next").className = "next show";
  }

  function finale() {
    $("scene").style.display = "none";
    ["place", "vis", "q", "read", "opts", "toast", "reveal", "next"].forEach(function (id) { var el = $(id); if (el) el.style.display = "none"; });
    $("finaleH").textContent = Scoring.headline();
    $("finalStamps").innerHTML = Scoring.finaleHTML();
    $("finale").className = "finale show";
    buildPassport();
    cheer(); confetti();

    /* §1.6 Repetition is earned across the run, not bought inside a question. */
    var missed = Scoring.missedIndexes(), rbtn = $("retry");
    if (missed.length && !retryMode) {
      if (!rbtn) {
        rbtn = document.createElement("button");
        rbtn.id = "retry"; rbtn.className = "next show";
        rbtn.style.marginRight = "8px";
        $("again").parentNode.insertBefore(rbtn, $("again"));
      }
      rbtn.textContent = "Play the ones I missed 🔁";
      rbtn.style.display = "";
      rbtn.onclick = function () {
        var items = missed.map(function (k) { return STOPS[k]; });
        retryMode = true; STOPS = items;
        Scoring.init({ slug: SLUG, total: STOPS.length });
        i = 0; restore(); render(); window.scrollTo({ top: 0 });
      };
    } else if (rbtn) { rbtn.style.display = "none"; }
  }

  function restore() {
    $("scene").style.display = "";
    ["place", "vis", "q", "read", "opts", "toast", "reveal", "next"].forEach(function (id) { var el = $(id); if (el) el.style.display = ""; });
    $("finale").className = "finale";
  }

  $("next").onclick = function () { i++; if (i >= STOPS.length) { finale(); return; } render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("again").onclick = function () { retryMode = false; i = 0; STOPS = pickStops(); Scoring.init({ slug: SLUG, total: STOPS.length }); restore(); render(); window.scrollTo({ top: 0 }); };
  /* §1.4 the latency clock restarts when the read-aloud finishes, so it measures
     thinking time rather than listening time. */
  $("read").onclick = function () { var s = STOPS[i]; Scoring.readStarted(); speak(s.place + ". " + (s.say || s.q), function () { Scoring.readEnded(); }); };
  $("snd").onclick = function () { soundOn = !soundOn; $("snd").textContent = soundOn ? "🔊" : "🔇"; if (!soundOn && "speechSynthesis" in window) speechSynthesis.cancel(); };

  // header + back nav
  if (HEADER.title) document.title = HEADER.title;
  if ($("logoEmoji")) $("logoEmoji").textContent = HEADER.logoEmoji || "🎮";
  if ($("logoText")) $("logoText").textContent = HEADER.logoText || "Play & Learn";
  if ($("grownText")) $("grownText").textContent = HEADER.grown || "";
  if ($("finaleH")) $("finaleH").textContent = HEADER.finaleH || "🏆 You did it!";
  if ($("finaleP")) $("finaleP").textContent = HEADER.finaleP || "Great playing!";
  if ($("again")) $("again").textContent = HEADER.again || "Play again 🔁";
  var back = $("back"); if (back) back.setAttribute("href", location.protocol === "file:" ? "index.html" : "/play");

  // "All games" escape hatch on the finale, next to Play again (2026-08-01).
  if ($("again") && !document.getElementById("allgames")) {
    var _ag = document.createElement("a");
    _ag.id = "allgames"; _ag.className = "next show ghost";
    _ag.href = location.protocol === "file:" ? "index.html" : "/play";
    _ag.textContent = "All games 🎮";
    _ag.style.textDecoration = "none"; _ag.style.marginLeft = "8px";
    $("again").parentNode.insertBefore(_ag, $("again").nextSibling);
  }

  render();
})();

/* Shared engine for the multiple-choice Play & Learn games.
   Each game page sets window.GAME = {BASE, HEADER, POOL_PICK, POOL} then loads this. */
(function () {
  "use strict";
  var G = window.GAME || {};
  var BASE = G.BASE, HEADER = G.HEADER || {}, POOL = G.POOL || [], PICK = G.POOL_PICK || 8;
  var $ = function (id) { return document.getElementById(id); };
  var i = 0, soundOn = true, locked = false, actx = null;

  function sample(arr, n) { var a = arr.slice(); for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = a[k]; a[k] = a[j]; a[j] = t; } return a.slice(0, Math.min(n, a.length)); }
  var STOPS = sample(POOL, PICK);

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
  function nope() { tone(180, 0.25, "sine", 0, 0.12); }
  function speak(txt) { if (!("speechSynthesis" in window)) return; speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(txt); u.rate = 0.92; u.pitch = 1.12; speechSynthesis.speak(u); }
  function confetti() {
    var cols = ["#ffd23f", "#34d3b0", "#ff6b6b", "#7fd1ff", "#a7f0a0"];
    for (var k = 0; k < 26; k++) { var c = document.createElement("div"); c.className = "confetti"; c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[k % cols.length]; c.style.animation = "fall " + (1.1 + Math.random() * 0.9) + "s ease-in " + (Math.random() * 0.2) + "s forwards"; c.style.opacity = 0; document.body.appendChild(c); (function (el) { setTimeout(function () { el.remove(); }, 2400); })(c); }
  }
  function buildPassport() {
    var p = $("passport"); if (!p) return; p.innerHTML = "";
    STOPS.forEach(function (s, k) { var d = document.createElement("div"); d.className = "stamp" + (k < i ? " got" : ""); d.id = "stamp" + k; d.textContent = k < i ? s.stamp : ""; p.appendChild(d); });
  }
  function render() {
    locked = false; var s = STOPS[i];
    $("scene").style.background = s.bg; $("city").textContent = s.city; $("flag").textContent = s.flag || "";
    $("place").firstChild.textContent = s.place; $("sub").textContent = s.sub; $("q").textContent = s.q;
    $("toast").textContent = ""; $("reveal").className = "reveal"; $("next").className = "next";
    var o = $("opts"); o.innerHTML = "";
    var order = s.opts.map(function (x, k) { return k; });
    for (var a = order.length - 1; a > 0; a--) { var b = Math.floor(Math.random() * (a + 1)); var t = order[a]; order[a] = order[b]; order[b] = t; }
    order.forEach(function (idx) {
      var opt = s.opts[idx]; var btn = document.createElement("button"); btn.className = "opt";
      btn.innerHTML = (opt.e ? '<span class="em">' + opt.e + '</span>' : '') + '<span>' + opt.t + '</span>';
      btn.onclick = function () { choose(btn, idx === s.ans); }; o.appendChild(btn);
    });
    buildPassport();
  }
  function choose(btn, correct) {
    if (locked) return;
    if (correct) {
      locked = true; btn.classList.add("right");
      document.querySelectorAll(".opt").forEach(function (b) { if (b !== btn) b.classList.add("dim"); });
      $("toast").textContent = "🌟 Well done!"; cheer(); confetti();
      var s = STOPS[i]; $("fact").textContent = s.fact;
      if (s.url) { $("golink").style.display = "inline-block"; $("golink").href = s.url; $("golink").textContent = s.linkLabel || "See on the site →"; } else { $("golink").style.display = "none"; }
      $("reveal").className = "reveal show";
      var st = $("stamp" + i); if (st) { st.textContent = s.stamp; st.className = "stamp got"; }
      $("next").textContent = i === STOPS.length - 1 ? "See my stamps →" : "Next →"; $("next").className = "next show";
    } else { btn.classList.add("wrong"); $("toast").textContent = "Not quite — try again! 💪"; nope(); setTimeout(function () { btn.classList.remove("wrong"); }, 450); }
  }
  function finale() {
    $("scene").style.display = "none";
    ["place", "q", "read", "opts", "toast", "reveal", "next"].forEach(function (id) { $(id).style.display = "none"; });
    $("finale").className = "finale show"; $("finalStamps").textContent = STOPS.map(function (s) { return s.stamp; }).join(" "); buildPassport(); cheer(); confetti();
  }
  $("next").onclick = function () { i++; if (i >= STOPS.length) { finale(); return; } render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("again").onclick = function () { i = 0; STOPS = sample(POOL, PICK); $("scene").style.display = ""; ["place", "q", "read", "opts", "toast", "reveal", "next"].forEach(function (id) { $(id).style.display = ""; }); $("finale").className = "finale"; render(); window.scrollTo({ top: 0 }); };
  $("read").onclick = function () { var s = STOPS[i]; speak(s.place + ". " + s.q); };
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

  render();
})();

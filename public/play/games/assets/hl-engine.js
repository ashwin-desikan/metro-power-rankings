/* Higher or Lower — binary-search engine for Play & Learn.
   The page sets window.HLGAME = {BASE, HEADER, ROUND_PICK, ROUNDS} then loads this.
   Each round: a known city/person, a hidden VALUE on a number line. Guesses get
   "higher"/"lower" feedback; eliminated range is shaded out. Score = few guesses.
   The reveal names the strategy: guess the middle = binary search. */
(function () {
  "use strict";
  var G = window.HLGAME || {};
  var HEADER = G.HEADER || {}, ROUNDS = G.ROUNDS || [], PICK = G.ROUND_PICK || 5;
  var $ = function (id) { return document.getElementById(id); };
  var soundOn = true, actx = null;

  function sample(arr, n) { var a = arr.slice(); for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = a[k]; a[k] = a[j]; a[j] = t; } return a.slice(0, Math.min(n, a.length)); }
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
  function blip(up) { tone(up ? 660 : 330, 0.14, "square", 0, 0.08); }
  function speak(txt) { if (!("speechSynthesis" in window)) return; speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(txt); u.rate = 0.92; u.pitch = 1.12; speechSynthesis.speak(u); }
  function confetti() {
    var cols = ["#ffd23f", "#34d3b0", "#ff6b6b", "#7fd1ff", "#a7f0a0"];
    for (var k = 0; k < 26; k++) { var c = document.createElement("div"); c.className = "confetti"; c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[k % cols.length]; c.style.animation = "fall " + (1.1 + Math.random() * 0.9) + "s ease-in " + (Math.random() * 0.2) + "s forwards"; c.style.opacity = 0; document.body.appendChild(c); (function (el) { setTimeout(function () { el.remove(); }, 2400); })(c); }
  }

  var PLAY = sample(ROUNDS, PICK);
  var ri = 0, R = null, lo = 0, hi = 0, guess = 0, tries = 0, totalTries = 0, totalPar = 0, done = false;

  function par(r) { var n = Math.floor((r.max - r.min) / r.step) + 1; return Math.ceil(Math.log(n) / Math.log(2)); }
  function fmtVal(v) {
    var u = R.unit;
    if (u === "million people") return v + " million";
    if (u === "billion dollars") return "$" + v + " billion";
    return "" + v;
  }
  function buildDots() {
    var p = $("passport"); p.innerHTML = "";
    PLAY.forEach(function (r, k) {
      var d = document.createElement("div");
      d.className = "dot" + (k < ri ? " got" : ""); d.textContent = k < ri ? "🎯" : (k + 1);
      p.appendChild(d);
    });
  }
  function drawLine() {
    var track = $("track");
    var span = R.max - R.min;
    var loP = ((lo - R.min) / span) * 100, hiP = ((hi - R.min) / span) * 100;
    $("elimLeft").style.width = loP + "%";
    $("elimRight").style.width = (100 - hiP) + "%";
    $("zone").style.left = loP + "%"; $("zone").style.width = (hiP - loP) + "%";
    var gP = ((guess - R.min) / span) * 100;
    $("marker").style.left = gP + "%";
    $("loLab").textContent = fmtVal(lo); $("hiLab").textContent = fmtVal(hi);
    $("guessVal").textContent = fmtVal(guess);
    $("range").textContent = "It's between " + fmtVal(lo) + " and " + fmtVal(hi);
    var chips = $("tries"); chips.textContent = "Guesses: " + tries + (tries ? "" : " — fewer is better!");
  }
  function snap(v) { return Math.round((v - R.min) / R.step) * R.step + R.min; }
  function clampG(v) { return Math.max(lo, Math.min(hi, snap(v))); }
  function setGuess(v) { guess = clampG(v); drawLine(); }

  function render() {
    done = false; R = PLAY[ri];
    lo = R.min; hi = R.max; tries = 0;
    guess = clampG((lo + hi) / 2);
    $("scene").style.background = R.bg;
    $("city").textContent = R.emoji;
    var fl = $("flag"); fl.textContent = "";
    if (R.flagUrl) { var fim = document.createElement("img"); fim.src = R.flagUrl; fim.alt = ""; fim.style.height = "30px"; fim.style.borderRadius = "4px"; fim.onerror = function () { fim.remove(); }; fl.appendChild(fim); }
    $("place").firstChild.textContent = R.name; $("sub").textContent = R.metric;
    $("q").textContent = R.q;
    $("toast").textContent = ""; $("reveal").className = "reveal"; $("next").className = "next";
    $("hunt").style.display = "";
    buildDots(); drawLine();
  }

  function win() {
    done = true; cheer(); confetti();
    totalTries += tries; totalPar += par(R);
    $("toast").textContent = "🎯 Found it in " + tries + (tries === 1 ? " guess!" : " guesses!");
    var p = par(R);
    var coach = "You found it in " + tries + (tries === 1 ? " guess. " : " guesses. ") +
      (tries <= p ? "That's computer-fast! " : "A computer needs about " + p + ". ") +
      "The trick: always guess the MIDDLE of what's left — that's called binary search, and it's how computers find things fast.";
    $("fact").textContent = R.name + ": " + R.actualText + ". " + R.fact + " " + coach;
    if (R.url) { $("golink").style.display = "inline-block"; $("golink").href = R.url; $("golink").textContent = R.linkLabel || "See on the site →"; } else { $("golink").style.display = "none"; }
    $("reveal").className = "reveal show";
    $("next").textContent = ri === PLAY.length - 1 ? "See my score →" : "Next round →";
    $("next").className = "next show";
    var st = $("passport").children[ri]; if (st) { st.textContent = "🎯"; st.className = "dot got"; }
  }

  function doGuess() {
    if (done) return;
    tries++;
    if (guess === R.target) { win(); return; }
    if (guess < R.target) {
      blip(true); $("toast").textContent = "⬆️ HIGHER than " + fmtVal(guess) + "!";
      lo = guess + R.step;   // target is always inside [lo, hi], so lo <= hi holds
    } else {
      blip(false); $("toast").textContent = "⬇️ LOWER than " + fmtVal(guess) + "!";
      hi = guess - R.step;
    }
    setGuess((lo + hi) / 2);
  }

  function finale() {
    $("scene").style.display = "none";
    ["place", "q", "read", "hunt", "toast", "reveal", "next"].forEach(function (id) { $(id).style.display = "none"; });
    $("finale").className = "finale show";
    var beat = totalTries <= totalPar;
    $("finalStamps").textContent = PLAY.map(function () { return "🎯"; }).join(" ");
    $("scoreLine").textContent = totalTries + " guesses for " + PLAY.length + " rounds — a computer needs about " + totalPar + ". " +
      (beat ? "You searched like a computer! 🤖" : "Remember the robot trick: always split the middle! 🤖");
    buildDots(); cheer(); confetti();
  }

  // controls
  $("track").addEventListener("click", function (ev) {
    if (done) return;
    var r = $("track").getBoundingClientRect();
    var frac = (ev.clientX - r.left) / r.width;
    setGuess(R.min + frac * (R.max - R.min));
  });
  $("minus").onclick = function () { if (!done) setGuess(guess - R.step); };
  $("plus").onclick = function () { if (!done) setGuess(guess + R.step); };
  $("robot").onclick = function () { if (!done) { setGuess((lo + hi) / 2); $("toast").textContent = "🤖 The middle — smart!"; } };
  $("guessBtn").onclick = doGuess;
  $("next").onclick = function () { ri++; if (ri >= PLAY.length) { finale(); return; } render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("again").onclick = function () {
    PLAY = sample(ROUNDS, PICK); ri = 0; totalTries = 0; totalPar = 0;
    $("scene").style.display = "";
    ["place", "q", "read", "hunt", "toast", "reveal", "next"].forEach(function (id) { $(id).style.display = ""; });
    $("next").className = "next";
    $("finale").className = "finale"; render(); window.scrollTo({ top: 0 });
  };
  $("read").onclick = function () { speak(R.name + ". " + R.q + " Tap the line, then press guess. I will say higher or lower."); };
  $("snd").onclick = function () { soundOn = !soundOn; $("snd").textContent = soundOn ? "🔊" : "🔇"; if (!soundOn && "speechSynthesis" in window) speechSynthesis.cancel(); };

  // header + nav
  if (HEADER.title) document.title = HEADER.title;
  if ($("logoEmoji")) $("logoEmoji").textContent = HEADER.logoEmoji || "🎯";
  if ($("logoText")) $("logoText").textContent = HEADER.logoText || "Higher or Lower";
  if ($("grownText")) $("grownText").textContent = HEADER.grown || "";
  if ($("finaleH")) $("finaleH").textContent = HEADER.finaleH || "🎯 You did it!";
  if ($("finaleP")) $("finaleP").textContent = HEADER.finaleP || "Great searching!";
  if ($("again")) $("again").textContent = HEADER.again || "Play again 🔁";
  var back = $("back"); if (back) back.setAttribute("href", location.protocol === "file:" ? "index.html" : "/play");
  if ($("again") && !document.getElementById("allgames")) {
    var _ag = document.createElement("a");
    _ag.id = "allgames"; _ag.className = "next show";
    _ag.href = location.protocol === "file:" ? "index.html" : "/play";
    _ag.textContent = "All games 🎮";
    _ag.style.textDecoration = "none"; _ag.style.marginLeft = "8px"; _ag.style.background = "#5b7b97"; _ag.style.boxShadow = "0 6px 0 #40566b";
    $("again").parentNode.insertBefore(_ag, $("again").nextSibling);
  }

  render();
})();

/* League Table Detective engine. Page sets window.LTGAME = {BASE, TABLES}. */
(function () {
  "use strict";
  var LG = window.LTGAME || {};
  var BASE = LG.BASE, TABLES = LG.TABLES || [];
  var $ = function (id) { return document.getElementById(id); };
  var table, QUESTIONS = [], i = 0, soundOn = true, actx = null;
  function sgn(n) { return (n > 0 ? "+" : "") + n; }
  function numOpts(c, alts) { var set = [c]; alts.forEach(function (a) { if (set.indexOf(a) < 0) set.push(a); }); var k = 1; while (set.length < 3) { if (set.indexOf(c + k) < 0) set.push(c + k); if (set.length < 3 && set.indexOf(c - k) < 0) set.push(c - k); k++; } return set.slice(0, 3).map(function (x) { return { t: String(x) }; }); }
  function diffOpts(d) { var set = [d]; [-d, d + 7, d - 7, d + 3, d - 3].forEach(function (a) { if (set.indexOf(a) < 0 && set.length < 3) set.push(a); }); return set.slice(0, 3).map(function (x) { return { t: sgn(x) }; }); }
  function tone(freq, dur, type, when, gain) { if (!soundOn) return; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); var o = actx.createOscillator(), g = actx.createGain(); o.type = type || "sine"; o.frequency.value = freq; g.gain.value = gain || 0.12; o.connect(g); g.connect(actx.destination); var t = actx.currentTime + (when || 0); o.start(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.stop(t + dur); } catch (e) {} }
  function cheer() { [523, 659, 784, 1047].forEach(function (f, k) { tone(f, 0.25, "triangle", k * 0.09, 0.14); }); }
  function learn() { [392, 523].forEach(function (f, k) { tone(f, 0.22, "triangle", k * 0.11, 0.11); }); }
  function speak(txt) { if (!("speechSynthesis" in window)) return; speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(txt); u.rate = 0.92; u.pitch = 1.1; speechSynthesis.speak(u); }
  function confetti() { var cols = ["#ffd23f", "#34d3b0", "#ff6b6b", "#7fd1ff", "#a7f0a0"]; for (var k = 0; k < 26; k++) { var c = document.createElement("div"); c.className = "confetti"; c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[k % cols.length]; c.style.animation = "fall " + (1.1 + Math.random() * 0.9) + "s ease-in " + (Math.random() * 0.2) + "s forwards"; c.style.opacity = 0; document.body.appendChild(c); (function (el) { setTimeout(function () { el.remove(); }, 2400); })(c); } }
  function teamLink(t) { return { url: BASE + "/teams/nfl/" + t.slug, label: "See the " + t.name + " on the site →" }; }

  function buildQuestions(T) {
    var t = T.teams, top = t[0], bottom = t[t.length - 1];
    var best = t.slice().sort(function (a, b) { return b.Diff - a.Diff; })[0];
    var fewest = t.slice().sort(function (a, b) { return a.W - b.W; })[0];
    var hd = Math.floor(top.PF / 100) % 10, td = Math.floor(top.PF / 10) % 10, od = top.PF % 10;
    var gp = top.W + top.L + top.T;
    var pvOpts = [{ t: String(hd) }, { t: String(td) }, { t: String(od) }].filter(function (o, ix, arr) { return arr.findIndex(function (z) { return z.t === o.t; }) === ix; });
    pvOpts = pvOpts.concat([{ t: String((hd + 1) % 10) }, { t: String((hd + 2) % 10) }]).filter(function (o, ix, arr) { return arr.findIndex(function (z) { return z.t === o.t; }) === ix; }).slice(0, 3);
    var Q = [];
    Q.push({ view: "table", hl: top.name, link: teamLink(top), q: "This is the real " + T.season + " " + T.division + " table. Which team finished TOP?", opts: [{ t: top.name }, { t: t[1].name }, { t: bottom.name }], ans: 0, fact: "The " + top.name + "! They won the most games (" + top.W + ") and top the table." });
    Q.push({ view: "table", hl: top.name, link: teamLink(top), q: top.T > 0 ? ("The " + top.name + " won " + top.W + ", lost " + top.L + " and tied " + top.T + ". How many games did they play? (" + top.W + " + " + top.L + " + " + top.T + ")") : ("The " + top.name + " won " + top.W + " games and lost " + top.L + ". How many did they play? (" + top.W + " + " + top.L + ")"), opts: numOpts(gp, [gp - 1, gp + 1]), ans: 0, fact: gp + " games. Every NFL team plays " + gp + " games in a season." });
    Q.push({ view: "table", hl: top.name, link: teamLink(top), q: "The " + top.name + " scored " + top.PF + " points. Which digit is in the HUNDREDS place?", opts: pvOpts, ans: 0, fact: "In " + top.PF + ", the " + hd + " is in the hundreds place. That is " + (hd * 100) + " + " + (td * 10) + " + " + od + "." });
    Q.push({ view: "table", hl: bottom.name, link: teamLink(bottom), q: "The " + bottom.name + " scored " + bottom.PF + " points and let in " + bottom.PA + ". What is their points difference? (" + bottom.PF + " − " + bottom.PA + ")", opts: diffOpts(bottom.Diff), ans: 0, fact: bottom.PF + " − " + bottom.PA + " = " + sgn(bottom.Diff) + ". " + (bottom.Diff < 0 ? "A minus means they let in more than they scored." : "") });
    Q.push({ view: "table", hl: best.name, link: teamLink(best), q: "Which team has the BEST points difference?", opts: [{ t: best.name }].concat(t.filter(function (x) { return x !== best; }).slice(0, 2).map(function (x) { return { t: x.name }; })), ans: 0, fact: "The " + best.name + ": " + sgn(best.Diff) + " (" + best.PF + " scored − " + best.PA + " let in)." });
    Q.push({ view: "table", hl: bottom.name, link: teamLink(bottom), q: "How many games did the " + bottom.name + " WIN? Read along their row to the W column.", opts: numOpts(bottom.W, [bottom.W + 1, bottom.L]), ans: 0, fact: "The " + bottom.name + " won " + bottom.W + ". You found it in the W (Won) column." });
    Q.push({ view: "bars", hl: fewest.name, link: teamLink(fewest), q: "The bars show how many games each team WON. Which team won the FEWEST?", opts: [{ t: fewest.name }].concat(t.filter(function (x) { return x !== fewest; }).slice(0, 2).map(function (x) { return { t: x.name }; })), ans: 0, fact: "The " + fewest.name + " — the shortest bar, " + fewest.W + " wins." });
    return Q;
  }
  function tableHTML(hl) {
    var r = '<table class="lt"><tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>Diff</th></tr>';
    table.teams.forEach(function (t) { var cls = t.Diff < 0 ? "neg" : "posn"; r += '<tr' + (hl === t.name ? ' class="hl"' : '') + '><td class="tm">' + (t.logo ? '<img class="crest" src="' + t.logo + '" alt="" onerror="this.style.display=&#39;none&#39;">' : '<span class="em">🏈</span>') + t.name + '</td><td>' + t.P + '</td><td>' + t.W + '</td><td>' + t.L + '</td><td>' + t.PF + '</td><td>' + t.PA + '</td><td class="' + cls + '">' + sgn(t.Diff) + '</td></tr>'; });
    return r + '</table><div class="legend">P=Played · W=Won · L=Lost · PF=Points For · PA=Points Against · Diff=Points Difference</div>';
  }
  function barsHTML() { var max = Math.max.apply(null, table.teams.map(function (t) { return t.W; })); var r = '<div class="bars">'; table.teams.forEach(function (t) { var h = Math.round(t.W / max * 150) + 10; r += '<div class="bar" style="height:' + h + 'px">' + t.W + '<span class="lab">' + (t.logo ? '<img class="crest" src="' + t.logo + '" alt="" onerror="this.style.display=&#39;none&#39;">' : '') + t.name + '</span></div>'; }); return r + '</div><div class="legend">Each bar shows a team\'s number of wins.</div>'; }
  function buildProgress() {
    var p = $("progress"); p.innerHTML = "";
    QUESTIONS.forEach(function (s, k) {
      var d = document.createElement("div"), r = Scoring._state.rounds[k];
      d.className = "dot" + (r ? " " + (r.tier === "gold" ? "got" : r.tier === "silver" ? "silver" : "miss") : "");
      d.textContent = r ? (r.tier === "grey" ? "🆕" : "★") : (k + 1);
      p.appendChild(d);
    });
  }
  function newGame() { table = TABLES[Math.floor(Math.random() * TABLES.length)]; QUESTIONS = buildQuestions(table); $("title").textContent = "🏈 " + table.league + " · " + table.division + " · " + table.season + " final standings"; i = 0; Scoring.init({ slug: "league-table-detective", total: QUESTIONS.length }); }
  function render() {
    var s = QUESTIONS[i];
    Scoring.beginRound(Scoring.idOf(s), s.q);
    $("view").innerHTML = s.view === "bars" ? barsHTML() : tableHTML(null);
    $("q").textContent = s.q; $("toast").textContent = ""; $("reveal").className = "reveal"; $("next").className = "next";
    var o = $("opts"); o.innerHTML = "";
    var order = s.opts.map(function (x, k) { return k; });
    for (var a = order.length - 1; a > 0; a--) { var b = Math.floor(Math.random() * (a + 1)); var t = order[a]; order[a] = order[b]; order[b] = t; }
    order.forEach(function (idx) { var opt = s.opts[idx]; var btn = document.createElement("button"); btn.className = "opt"; btn.setAttribute("data-idx", idx); btn.innerHTML = (opt.em ? '<span class="em">' + opt.em + '</span>' : '') + '<span>' + opt.t + '</span>'; btn.onclick = function () { choose(btn, idx === s.ans); }; o.appendChild(btn); });
    buildProgress();
  }
  /* Honest Answer loop — PLAY-MASTERY-SPEC.md §1. One answer per round; a miss
     reveals the correct row and still gives the fact, so it teaches rather than
     stalls. Only the dot colour and the tally differ. */
  function choose(btn, correct) {
    if (Scoring.answered() || !Scoring.armed()) return;
    var res = Scoring.answer(correct), s = QUESTIONS[i];
    document.querySelectorAll(".opt").forEach(function (b) {
      var idx = +b.getAttribute("data-idx");
      if (idx === s.ans) b.classList.add(correct ? "right" : "shown");
      else if (b === btn) b.classList.add("picked");
      else b.classList.add("dim");
    });
    if (correct) { $("toast").textContent = res.tier === "gold" ? "🌟 Great detective work!" : "👍 You worked it out!"; cheer(); confetti(); }
    else { $("toast").textContent = "🆕 Now you know it!"; learn(); }
    if (s.view !== "bars" && s.hl) $("view").innerHTML = tableHTML(s.hl);
    $("fact").textContent = s.fact;
    if (s.link) { $("golink").style.display = "inline-block"; $("golink").href = s.link.url; $("golink").textContent = s.link.label; } else $("golink").style.display = "none";
    $("reveal").className = "reveal show";
    buildProgress();
    $("next").textContent = i === QUESTIONS.length - 1 ? "Finish →" : "Next clue →";
    $("next").className = "next show";
  }
  $("next").onclick = function () { i++; if (i >= QUESTIONS.length) { finale(); return; } render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  function finale() {
    ["q", "read", "opts", "toast", "reveal", "next"].forEach(function (id) { $(id).style.display = "none"; });
    $("view").innerHTML = tableHTML(null);
    if ($("finaleH")) $("finaleH").textContent = Scoring.headline();
    if ($("finalStamps")) $("finalStamps").innerHTML = Scoring.finaleHTML();
    $("finale").className = "finale show"; buildProgress(); cheer(); confetti();
  }
  $("again").onclick = function () { newGame(); ["q", "read", "opts", "toast", "reveal", "next"].forEach(function (id) { $(id).style.display = ""; }); $("finale").className = "finale"; render(); window.scrollTo({ top: 0 }); };
  // "All games" escape hatch on the finale, next to New table (2026-08-01).
  if ($("again") && !document.getElementById("allgames")) {
    var _ag = document.createElement("a");
    _ag.id = "allgames"; _ag.className = "next show";
    _ag.href = location.protocol === "file:" ? "index.html" : "/play";
    _ag.textContent = "All games 🎮";
    _ag.style.textDecoration = "none"; _ag.style.marginLeft = "8px"; _ag.style.background = "#5b7b97"; _ag.style.boxShadow = "0 6px 0 #40566b";
    $("again").parentNode.insertBefore(_ag, $("again").nextSibling);
  }
  $("read").onclick = function () { speak(QUESTIONS[i].q); };
  $("snd").onclick = function () { soundOn = !soundOn; $("snd").textContent = soundOn ? "🔊" : "🔇"; if (!soundOn && "speechSynthesis" in window) speechSynthesis.cancel(); };
  var back = $("back"); if (back) back.setAttribute("href", location.protocol === "file:" ? "index.html" : "/play");
  newGame(); render();
})();

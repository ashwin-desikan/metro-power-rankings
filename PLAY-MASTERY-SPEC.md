# Play & Learn — Mastery Spec (Wave 3)

## 0. Status as of 2026-08-30 (evening)

**P0 is BUILT and verified, not yet committed.** Working tree only — review the
diff before committing, and note the deploy discipline in `CLAUDE.md`: this
touches `public/`, so it is a real build.

Shipped:

- **`public/play/games/assets/scoring.js` (new, 230 lines)** — the Honest Answer
  model: one answer per round, 350 ms input deadzone, latency capture, gold /
  silver / newly-learned tiers, Leitner-weighted sampling, mastery in
  localStorage, honest finale. Configurable `stampClasses` and `noun` so the
  bespoke shells can use it without adopting `styles.css` class names.
- **`assets/engine.js` and `assets/vq-engine.js`** — rewritten onto the new loop.
  `vq-engine.js` is now GENERATED from `engine.js` by a four-substitution patch,
  so the two cannot drift; regenerate rather than hand-editing it.
- **`assets/lt-engine.js`** — same loop, adapted.
- **14 shared-engine shells** — `assets/scoring.js` script tag inserted.
- **Alex's four favourites converted by hand**: `us-or-uk.html`,
  `whos-the-boss.html`, `champions-duel.html`, `penalty-shootout.html`.
- **`rhythm-echo.html` (new)** — Game B from §3.2, plus registration in
  `app/play/page.tsx` (group `think`, topics maths + music) and `games/index.html`.
- **`assets/styles.css`** — tier and tally styles appended.

### Four corrections this build made to the spec below

1. **`hl-engine.js` (Higher or Lower) needed no change.** It already scores
   honestly: it counts guesses against binary-search par and reports the
   comparison. §1.8 wrongly lists it. Leave it alone.
2. **The arcade is mostly bespoke, not engine-driven.** 14 of 41 games use a
   shared engine; **27 carry their own copy of the defective loop**. The shared
   patch therefore converts about a third of the arcade, not all of it. The
   remaining 23 (four are done) are listed in §1.10 and are the next batch.
3. **Item IDs come free.** §1.7 asks the Python builders to emit `id`. Not
   needed to ship: `Scoring.idOf()` falls back to a djb2 hash of the question
   text, which is stable across runs. Emitting real IDs is now hardening, not a
   prerequisite, and matters only if question wording changes (a reworded
   question reads as a new item and loses its history).
4. **Penalty Shootout got a better fix than "one answer".** The keeper used to
   dive the wrong way every time, so every kick was a goal regardless of the
   answer — there was no stake at all. Now the keeper dives the wrong way only
   when the answer was right first time. Know it, score it. This is the most
   legible statement of the rule for a footballer, and it is the change most
   likely to be felt.

### Verified in headless Chromium at 390px

| Check | Result |
|---|---|
| One answer per round; extra taps ignored (16 mash taps) | PASS on all five converted games |
| 350 ms deadzone swallows a carried-over tap | PASS |
| A miss reveals the correct answer AND still shows the fact | PASS |
| A miss still advances the round (never a dead end) | PASS |
| Stamps render gold / silver / newly-learned | PASS |
| Finale never uses the word "wrong"; headline counts what was learned | PASS |
| "Play the ones I missed" replays exactly the missed items | PASS |
| Mastery persists per item in localStorage | PASS |
| Penalty Shootout: miss is saved, correct answer scores | PASS |
| Rhythm Echo: 30 fast taps score grey, "28 extra taps" reported | PASS |
| Rhythm Echo: accurate play scores gold, 30%-late scores silver | PASS |
| Rhythm Echo: 2,400 generated bars all sum exactly | PASS |
| No page-level horizontal scroll at 390px | PASS |
| Console errors | none (bar external crest/flag CDNs unreachable in the sandbox) |

### Two bugs found and fixed during the build, worth remembering

- **AudioContext is suspended until a user gesture.** Rhythm Echo auto-played on
  load, so the first rhythm was silent and the count-in never appeared. Fixed
  with a start cover, matching the house pattern; `ctx()` now calls `resume()`.
  **Any future audio game needs the same opening.**
- **`.bar` collides with the chart-bar rule in `styles.css` (`width:52px`).** It
  squeezed the stave into a 52px column and stacked every note vertically. New
  games must check class names against `assets/styles.css`, which is shared and
  unscoped. Rhythm Echo uses `.rbar`.

---

*Written 2026-08-30. Sits alongside `PLAY-NEXT-TIER-SPEC.md`, which stays valid.
That spec answered "what should the games be about." This one answers
"why is the player beating them without learning," and "what does he need next."*

---

## 0. Why this spec exists

After a month of daily play, two behaviours are observable:

1. On some games the player **taps every option until one turns green**.
2. On other games he **recites the answers from memory** on the second run.

Both are rational responses to the current design. Neither is learning.
This spec removes the conditions that make them rational.

**The single root cause, confirmed in code.** Every game in
`public/play/games/` shares one reward loop:

```js
// assets/engine.js, choose()
if (correct) { locked = true; cheer(); confetti(); /* stamp, fact, next */ }
else { btn.classList.add("wrong"); toast("Not quite — try again!"); /* nothing else */ }
```

A wrong answer costs nothing. The round does not advance until the answer is
right. The celebration, the passport stamp, the revealed fact and the finale are
**identical** whether the player knew the answer or found it on the fourth tap.
The same block, copy-adapted, appears in `assets/vq-engine.js`,
`champions-duel.html`, `us-or-uk.html`, `whos-the-boss.html`,
`penalty-shootout.html` and the rest.

**Why that produces two different behaviours.**

| Game shape | Examples | Optimal strategy for the player | What he does |
|---|---|---|---|
| 2 options | US or UK, Champions Duel | Guess. Expected 1.5 taps to success. | Taps until green |
| 3 options | Who's the Boss, Penalty Shootout | Guess. Expected 2 taps. | Taps until green |
| 4 options, fixed pool | `engine.js` games | Memorise the finite item list | Recites answers |

Guessing wins where the option count is low. Memorising wins where it is not.
Understanding never wins, because understanding is never the cheaper path.

**The design correction is not punishment.** It is this: *change what is
celebrated.* Celebrate the first-try answer and celebrate the newly-learned
answer, as two different things. Never celebrate a lucky tap.

---

## 0b. Status update — 2026-08-30 (late)

**Batch conversion done. 18 of 41 games now run the Honest Answer loop.**
Still working tree only, nothing committed.

Converted in this pass (12, via three context-grouped Sonnet workers, all
verified by me in headless Chromium):

| Group | Games |
|---|---|
| Be the Ref (binary calls) | `ball-or-strike`, `catch-or-no-catch`, `hows-that`, `offside-or-onside` |
| MCQ with a Next-disabled guard | `big-rivals`, `crest-sort`, `flag-sort`, `music-from`, `leader-time-machine`, `champions` (3 handlers) |
| Map / marker | `five-oceans`, `then-and-now` |

Plus `assets/scoring.js` now **injects its own tier CSS** (`#scoring-css`). 27 of
the games are self-contained shells that never load `styles.css`; shipping the
CSS from the module removed a whole class of copy-paste drift and took styling
out of the conversion job entirely.

**Verified for all 12:** one answer per round, extra taps after answering record
nothing, the correct option is revealed on a miss, the fact still shows, the
round still advances, stamps carry the tier, no "try again" copy survives, no
console errors, no horizontal scroll at 390px. Two worker findings worth
keeping: the Be the Ref games already tracked `firstTry`/`perfect` so their fix
was small; and `then-and-now` has a time-dial that lets rounds be answered out
of order, so its passport had to key on item id rather than array index.

### Rhythm Echo was rebuilt (v2) after failing a real reader

v1 shipped and **Ashwin could not follow it.** That is the only test that
matters and it failed. Causes, all interface rather than concept:
- Two competing mode buttons ("Listen again" / "My turn") with no visible state.
- Bare notation, which a child who has not started lessons cannot read.
- Instructions as prose rather than as something the game demonstrates.

v2 fixes all three and is the pattern for every future game here:
1. **No modes.** One continuous flow: it plays, then it is your turn, automatically.
2. **State is the biggest thing on screen.** A coloured banner reads "🎧 Listen…"
   then "🥁 Your turn!", the stage changes colour, and the tap pad is grey and
   dead until it is live and yellow.
3. **Duration is WIDTH.** Each note is a block sized in proportion to its length,
   with the symbol on the block. You can see the rhythm before you can read it,
   and the notation is learned by association rather than by instruction.
4. Round 1 is always four even beats. The ramp starts at the floor.

### Note Value Lab shipped (§3.2 Game A)

`note-value-lab.html`, registered in `app/play/page.tsx` and the fallback hub.
Deliberately shares Rhythm Echo's visual language — same blocks, same
width-is-duration rule, same note drawings — so the two games teach each other.

- A bar holds 4 beats. Tap notes to drop them in; when it is exactly full **it
  plays**, so the arithmetic is audible rather than merely marked correct.
- 8 rounds: free fill → finish a part-built bar (which is 4 minus what is there)
  → fill using exactly N notes (forces equivalence reasoning) → everything.
- **A note that will not fit is not blocked.** It is placed, shown overflowing,
  and bounced back with "a minim is 2 beats, but only 1 beat is left." Blocking
  it would hide the very thing being taught.
- Scoring: gold = built it with no wrong pieces and no removals; silver = got
  there after a wrong piece or a change of mind; grey = used "Show me". There is
  no mashable path.
- Verified: all 8 levels solvable, count-mode refuses to close on 4 beats with
  the wrong number of notes, widths proportional, overflow explains itself,
  playback fires, 20/20 games clean on a full smoke pass.

**Third correction to this spec:** the `.bar` class collision bit twice (it is a
52px chart bar in the shared `styles.css`). A warning comment now sits at the
top of `assets/styles.css`, and new games prefix their classes (`.rbar`,
`.nvbar`). Grep that file before naming a class.

### Still on the old loop (11)

`capital-match`, `crest-match`, `flag-flash`, `times-table-striker`,
`stadium-stacker`, `big-match-adder`, `fraction-football`, `shape-flag-lab`,
`kickoff-clock`, `chart-champions`, `big-match-adder`. These were deliberately
NOT batched: they are matching games where a mismatch is part of the mechanic,
timed streak games, or maths games that already keep their own score. Each needs
a judgement call about what "one answer" even means, not a mechanical patch.

---

## 0c. Status update — 2026-08-30 (final)

**The whole arcade is converted. 28 of 28 playable games now run an Honest
Answer variant, plus two new games.** Working tree only, nothing committed.

Converted in this last pass (10):

| Group | Games | Model applied |
|---|---|---|
| Maths games sharing one `onCorrect`/`onWrong` pair | `times-table-striker`, `kickoff-clock`, `shape-flag-lab`, `fraction-football`, `stadium-stacker`, `big-match-adder`, `chart-champions` | Split into three: `onCorrect`, `onMiss` (choice), `onWrong` (build nudge) |
| Pair matching | `capital-match` | Directness — a round matched with no mismatches is gold |
| Memory | `crest-match` | Flips against par, like Higher or Lower's binary-search par |
| Timed streak | `flag-flash` | Tier reporting only; the loop was already honest |

### The distinction that mattered: CHOICE vs BUILD

The seven maths games have two kinds of call site and they must not be treated
alike:

- **CHOICE** — a discrete right/wrong pick (`if(i===ans) onCorrect() else onWrong()`).
  One answer ends the round; a miss reveals the answer and still teaches.
- **BUILD** — a construction or ordering step ("not enough fans yet", "compare
  the millions digits first"). The player is mid-task, not wrong. Ending the
  round here would break the game.

So `onWrong` survives as a **nudge that does not end the round but costs the
gold**, and a new `onMiss` is the one-answer ending. A build task is scored on
directness, exactly like Note Value Lab. Getting this backwards would have made
`stadium-stacker` unplayable, which is why these ten were held back from the
first batch rather than patched mechanically.

### Three games that should NOT get the one-answer loop, and why

1. **`crest-match`** is a memory game. A wrong flip IS the mechanic. It now
   counts flips against par (2N flips = a perfect memory) and reports
   "You matched 8 pairs in 16 flips. A perfect memory needs 16."
2. **`flag-flash`** is a 7-second timed streak game. A wrong tap already resets
   the streak while the clock runs, and `timeUp()` already reveals the answer.
   The loop was honest; it only lacked the mastery signal. One-answer here would
   make it punishing.
3. **`capital-match`** is pair matching. A mismatch is part of matching. The real
   upgrade was making a mismatch **teach**: tapping Lisbon while Portugal is
   selected now says "Lisbon is the capital of Portugal" — a fact the player
   keeps, instead of a buzzer.

### Call the Play shipped (§3.3 Game E)

`call-the-play.html`, group `coder`, topics logic-coding + sports.

Eight hand-authored drives ramping from "you get four downs" to the victory
formation, teaching down and distance, field position, kicking range and clock
management. A field strip shows the ball and the first-down marker; chips show
down, distance, spot, clock, score and timeouts.

**The design decision worth keeping:** every call is graded **best / reasonable
/ poor**, not right/wrong, and those map exactly onto gold / silver /
newly-learned. Real football usually has more than one defensible call — on
first down a run and a short pass are equally sensible — and pretending
otherwise would teach a falsehood about the sport as well as about
decision-making. When a scenario has two best calls the reveal names both. After
any call, every option is colour-graded on screen and the reasoning is given.

Verified: poor calls score grey and still name the best call and the rule; best
scores gold; reasonable scores silver; all 8 drives remain playable when every
call is poor; mash guard holds; no "wrong" in any child-facing copy.

### Final verification

31/31 game pages load clean at 390px with no console errors and no horizontal
scroll. Behaviour spot-checks pass on all six converted maths games (one answer,
reveal, advance), on `crest-match` (a perfect run scores gold and reports par)
and on `call-the-play`.

**Remaining work is no longer conversion.** It is §2.2 (the distractor contract)
and §2.3 (generated maths items), which are about making the content
inexhaustible rather than making the loop honest.

---

## 1. P0 — The Honest Answer loop

One change, applied to two shared engines plus a new shared module for the
bespoke games. It converts the whole arcade at once.

### 1.1 One answer per round

The first tap locks the round.

- **Correct** → current behaviour unchanged. Cheer, confetti, gold stamp, fact,
  `Next →`.
- **Wrong** → dim the chosen option, highlight the correct one, **still show the
  `fact`**, toast `"Now you know it! ⭐"`, grey stamp, `Next →`.

The player is never stuck and never sees a failure screen. He still gets the
teaching content on a miss. Only the stamp and the score change.

### 1.2 Three-tier passport stamps

The passport already exists and the player reads it. Make it carry signal.

| Stamp | Condition |
|---|---|
| **Gold** | Correct on first tap, under the fast threshold |
| **Silver** | Correct on first tap, over the fast threshold |
| **Grey outline** | Missed, then shown |

This makes the difference between knowing and working it out visible to the
player himself, which is the point.

### 1.3 Input deadzone

Add a 350 ms deadzone after each `render()` during which taps are ignored.
A rapid tap left over from the previous round must not register as an answer.
Without this, `Next →` and the first option of the new round are one flick apart
and the lock in 1.1 can be spent by accident.

### 1.4 Latency capture

Start a `performance.now()` clock at `render()`. Stop it on first tap.
If `🔊 Read it to me` was pressed, restart the clock at `speechSynthesis` end.

Latency is the best available signal for separating **recall** from
**reasoning** from **guessing**:

| Band | Reading |
|---|---|
| < 2.5 s | Retrieved from memory |
| 2.5 – 8 s | Worked it out |
| > 8 s, or missed | Not yet secure |

*Flagged as calibration, not fact: these thresholds are a starting guess. For a
seven-year-old with attention variance the per-item number is noisy. Read the
trend across sessions, never a single item.*

### 1.5 Honest finale

Replace the current "here are all your stamps" finale, which shows the same
thing regardless of performance, with:

```
⭐ 7 first time
👍 2 worked out
🆕 1 new thing learned:  "Which ocean is between Africa and Australia?"

[ Play the ones I missed 🔁 ]   [ Play again 🔁 ]   [ All games 🎮 ]
```

The headline is **"you learned N new things,"** never "you got N wrong."
The missed-items list is the first genuine learning signal the arcade has ever
produced for the adult reading over his shoulder.

### 1.6 Retry as a second phase

`Play the ones I missed 🔁` replays only the grey items. This preserves
mastery-through-repetition, which works well for this player, while removing the
free re-guess *inside* a round. Repetition is earned across the run, not bought
mid-question.

### 1.7 Mastery memory (localStorage)

Key: `cofn:play:v1:<slug>:<itemId>` → `{ seen, goldStreak, lastMs, lastSeenISO }`

**This requires stable item IDs, which pools do not currently have.** Add `id` to
the pool contract: a short hash of the question text, generated by the Python
builders in `scripts/games/`. Items authored inline in bespoke HTML shells get a
hand-assigned `id`.

Then weight sampling in `pickStops()`:

| Item state | Sampling weight |
|---|---|
| Never seen | 3.0 |
| Missed last time | 3.0 |
| Silver | 2.0 |
| Gold once | 1.0 |
| Gold twice in a row | 0.3, and suppressed for 7 days |

This is the cheapest anti-memorisation lever available and it works inside the
existing fixed pools. It is a Leitner box in forty lines.

### 1.8 Files touched

| File | Change |
|---|---|
| `assets/engine.js` | Honest Answer loop, tiered stamps, latency, weighted `pickStops()`, honest finale |
| `assets/vq-engine.js` | Same, kept in sync |
| `assets/hl-engine.js`, `assets/lt-engine.js` | Same loop, adapted to their mechanics |
| **`assets/scoring.js` (new)** | Shared module: `Scoring.start()`, `.answer(isCorrect)`, `.stamp()`, `.finale()`, mastery read/write. Bespoke shells import this instead of re-implementing |
| `champions-duel.html`, `us-or-uk.html`, `whos-the-boss.html`, `penalty-shootout.html`, `catch-or-no-catch.html`, `ball-or-strike.html`, `hows-that.html`, `offside-or-onside.html` | Swap their private `choose()` for `Scoring` |
| `scripts/games/*.py` | Emit `id` on every pool item |
| `scripts/games/clean_game_pools.py` | Validate `id` present and unique |

### 1.10 The 23 bespoke games still on the old loop

Each carries its own copy of the free-retry `choose()`. Grouped by shared
structure so a conversion pass can batch them:

- **Two/three-option card games** (closest to the four already done):
  `catch-or-no-catch`, `ball-or-strike`, `hows-that`, `offside-or-onside`,
  `big-rivals`, `five-oceans`, `north-or-south` variants.
- **Grid / sort games**: `crest-sort`, `flag-sort`, `crest-match`,
  `capital-match`, `flag-flash`.
- **Maths games** (already have their own scoring; check before changing):
  `times-table-striker`, `big-match-adder`, `stadium-stacker`,
  `fraction-football`, `shape-flag-lab`, `kickoff-clock`.
- **Other**: `champions`, `chart-champions`, `then-and-now`,
  `leader-time-machine`, `music-from`.

Convert the first group first: they are structurally identical to `us-or-uk`
and the patch is nearly mechanical. Check the maths group individually — several
already count attempts and may need only the tier reporting.

### 1.9 Pros and cons

**For:** one contained change converts ~37 games. It produces the first real
data on what the player actually knows. It removes the incentive to mash without
removing anything he enjoys.

**Against:** the first two or three sessions will score visibly lower than he is
used to. For a player whose confidence is the whole point, that is a genuine
risk, not a theoretical one.

**Mitigation, and this matters more than the feature itself:** ship 1.1 to 1.6
together, never 1.1 alone. A miss must always produce the fact, a warm line and a
route to convert grey to gold in the same sitting. The first run after the change
should be a game he is strong on, not a weak one.

---

## 2. P1 — Anti-memorisation: generative items

Section 1.7 slows memorisation. This section makes it structurally impossible.

### 2.1 The real problem is fixed distractors, not small pools

Option *positions* already shuffle. Option *sets* do not. So the player learns
"the answer to this card is Chelsea," not the rule that produces the answer.
Growing the pool from 30 items to 80 buys three weeks. It does not fix anything.

**`penalty-shootout.html` already does the right thing** and is the pattern to
generalise:

```js
const wrong = shuffle(same.length >= 2 ? same : COUNTRIES.filter(x => x.iso !== c.iso)).slice(0, 2);
const set  = shuffle([c, ...wrong]);
const ans  = set.indexOf(c);
```

Distractors are drawn at render time from a rule-defined candidate set.

### 2.2 The distractor contract

Extend the pool item schema. Both forms stay supported, so migration is
incremental and no existing game breaks.

```js
// Current (still valid)
{ id, q, opts: [{t, e?, logo?}], ans, fact, ... }

// New
{
  id, q,
  answer: { t, e?, logo? },
  distractors: {
    from: "countries",              // named candidate set the game registers
    rule: "sameContinent",          // sameContinent | sameConfederation | sameDecade
                                    // | nearestByPopulation | sameFirstLetter | any
    n: 3,
    exclude: ["USA"],               // optional hard exclusions
    minSeparation: 0.10             // numeric answers: no distractor within 10%
  },
  fact, ...
}
```

The engine builds `opts` and `ans` at `render()`.

**Why this is the highest-value change in the spec.** A fixed four-option item is
one memorisable fact. The same item with runtime distractors drawn from a
fifty-item candidate set is roughly 20,000 distinct presentations. Only the rule
generalises. There is nothing finite left to memorise.

### 2.3 Fully generated items, where the question has no editorial content

For the maths and reasoning games, generate the **question** at runtime rather
than pre-baking a pool. Migrate in this order:

| Game | Generation source | Guardrail |
|---|---|---|
| `times-bigger` | two metros from `metros.json` | ratio band 1.8x – 12x, rounds to a clean number |
| `higher-or-lower` | `metros.json`, `billionaires.json` | no pair within 15% |
| `bigger-city` | `metros.json` | as above |
| `north-or-south` | `metros.json` lat | minimum 8° latitude separation |
| **Per Person** (new, from Wave 2 spec) | `country-indicators.json` | denominators > 1M only |

**Keep pre-baked** wherever `fact` is editorial and needs a human: Champions
Duel finals, Who's the Boss, US or UK, Leader Time Machine. Those get section 2.2
plus section 1.7 instead.

### 2.4 Generation guardrails, non-negotiable

- No near-ties. An ambiguous item teaches the player that the game is unfair,
  and he is right.
- No distractor within `minSeparation` of the correct value.
- Answers round to a number a seven-year-old can say.
- Every generated item must still produce a `fact`. Generate the sentence from a
  template; never ship a blank reveal.

---

## 3. P1/P2 — New games

### 3.1 The strategic read

The new interests are **chess, bike riding, Roblox spaceflight and Madden
challenge games**, plus **cello or violin from w/c 21 September** and a weekly
performing arts class.

Every one of those is **sequential and procedural**. Plan a sequence of moves.
Execute a motor sequence. Run a launch procedure. Call a play under constraint.
Play notes in time. Rehearse and perform.

The existing arcade is **almost entirely declarative**. It asks him to select a
known fact. That is precisely why memorising wins: the games only ever ask for
recall, so recall is the whole skill.

**The next tier must ask him to produce a sequence, not select a fact.**
That is also, exactly, what coding is. It is the same recommendation as the
coding bridge in `PLAY-NEXT-TIER-SPEC.md` section 4, arrived at from his own
choice of play rather than from the dataset.

### 3.2 Music tier — build this first

He starts instrumental lessons in three weeks. There is a real window here.

**Game A — Note Value Lab** *(new engine, biggest single win)*

Fill a 4/4 bar with note cards. Semibreve 4, minim 2, crotchet 1, quaver ½.
The bar closes only when the values sum to 4. Then it **plays back** so the
answer is audible, not merely marked correct.

- Maths: fractions, equivalence, addition of fractions, and multiplication with
  a meaning. He resists times tables because they feel arbitrary to him. Note
  values are the least arbitrary form of the same relationship that exists:
  four crotchets *are* a semibreve, and he can hear it.
- Music: KS2 duration and notation, three weeks before he needs it.
- Engine: new. Tap-to-place bar builder plus Web Audio playback. The existing
  `tone()` helper in `engine.js` covers the audio.

**Game B — Rhythm Echo** *(cheap, and the first sequence-production game)*

Hear a rhythm, tap it back. Grows from 3 to 8 events. Scores on timing accuracy,
not on a right answer, so mashing is not even expressible as a strategy.

- Trains pulse, working memory and coordination. All three are named targets of
  the performing arts class, which is a useful alignment.
- Engine: new but small. Web Audio only, no data pipeline, no pool.

**Game C — String and Note Finder** *(MCQ, cheap)*

Cello open strings C-G-D-A, violin G-D-A-E, then first position. Show a
fingerboard, play a pitch, he names the string or finger.

- Pre-empts the first six to eight weeks of lessons so he arrives already
  fluent. That is a confidence play as much as a music one.
- **Open question before build: which instrument.** The school email covers both.

**Game D — Music Around the World** *(extend existing `music-from.html`)*

Instruments by country, wired to the geography he already loves. Existing engine,
pool-only build, near-zero cost.

### 3.3 Sport tier — the strongest hook he has

**Game E — Call the Play** *(new engine, highest bridge value)*

Madden-shaped. `3rd and 4. Your own 40. 1:20 left. One timeout.`
Choose: run, short pass, deep pass, punt. Show the outcome, then the reasoning.

This is a **decision tree under constraints**, the exact CS concept the Wave 2
spec targets, dressed as the thing he chose to play voluntarily on a phone. It
is the shortest available path between what he plays and what he needs to learn.
Scenarios are hand-authored; no data pipeline required for v1.

**Game F — Plan the Ride** *(new engine)*

Shortest path across a simple London map, on a bike. This is Wave 2's P3
"Metro Connections" graph game, re-skinned onto something he now does with his
body. Same CS content, far better hook. Recommend replacing Metro Connections
with this outright.

### 3.4 Space and code tier

**Game G — Launch Sequence** *(new engine, small)*

Put the steps of a launch in order: fuel, ignition, liftoff, max Q, stage
separation, orbit insertion. Then the harder mode: one step is in the wrong
place, find it.

This is the cheapest possible statement of "a program is an ordered list of
steps," followed immediately by "debugging is finding the step that is wrong."
It sits on top of an interest he already has, and he already plays a Roblox game
in which he launches a spaceship.

**Track H — Roblox Studio** *(off-arcade, not a web game)*

He plays Roblox voluntarily. Roblox Studio with Lua is the natural coding step
and the motivation is already paid for. First project: build the spaceship he
already flies. Recommend this over Scratch as the entry point, on the grounds
that the output is something he already values rather than something he has to
be sold on. Scratch stays useful later for the concepts.

---

## 4. Build order

| Priority | Item | Cost | Why here |
|---|---|---|---|
| **P0** | §1 Honest Answer loop + `scoring.js` | Medium, one pass over shared engines | Everything else is measured against it. Without it, no new game is safe from the same defect |
| **P0** | §1.7 item IDs in builders | Small | Prerequisite for mastery tracking and for any progress reporting |
| **P0** | Game B — Rhythm Echo | Small | First sequence game. Immune to mashing by construction. Ships in one sitting |
| **P1** | Game A — Note Value Lab | Large | The fractions unlock. Time it to the start of lessons, w/c 21 Sep |
| **P1** | §2.2 distractor contract | Medium | Structural fix for memorising |
| **P1** | Game E — Call the Play | Medium | Best interest-to-concept bridge available |
| **P2** | §2.3 generated maths items | Medium | Retires the last memorisable pools |
| **P2** | Games C, D, F, G | Small to medium each | Breadth once the loop is sound |
| **P3** | Track H — Roblox Studio | Off-arcade | Separate track, parent-led, not a repo change |

Front-loading the scoring loop and Rhythm Echo puts a working, unmashable game
in front of the player within days, before any large engine build starts.

---

## 5. Open questions for the build

1. **Cello or violin?** Determines Game C. The school email covers both.
2. **Is the miss-then-reveal loop right for this player?** The spec assumes yes,
   with the mitigations in §1.9. Watch the first two sessions directly rather
   than trusting the score file.
3. **Should mastery data sync?** localStorage is per-device. If he plays on more
   than one device the picture fragments. Out of scope for Wave 3; note it.
4. **Latency thresholds** in §1.4 are a guess. Log for two weeks before letting
   them drive stamp colour; ship silver/gold on a provisional threshold and
   recalibrate from his own distribution.

---

## 6. Content cautions

Carried forward from `PLAY-NEXT-TIER-SPEC.md` §5 and extended.

- Keep `conflicts.json` out of children's games.
- Frame `billionaires.json` strictly as magnitude, never aspiration.
- **New:** the honest finale must never rank him against anyone, and must never
  show a streak that can be broken. Loss aversion is the wrong motivator here.
- **New:** no timer that runs down on screen. Latency is captured silently.
  A visible countdown converts a reasoning task into an anxiety task, and would
  undo the point of §1.

---

*Written against `public/play/games/**` and `public/data/**` as of 2026-08-30.
Track this file so a cold instance can read it as a build contract, per the
precedent set by `PLAY-NEXT-TIER-SPEC.md`.*

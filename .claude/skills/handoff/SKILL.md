---
name: handoff
description: "Read and update HANDOFF.md, the async coordination log between the Windows and Mac-mini Claude Code instances working this repo. Use at the start of any nontrivial civic/data-pipeline work (read for open threads before touching mayors/governors/Congress/civic refreshes, or before assuming you're the only active session), and at the end of any session that changed shared automation, hit an unresolved cross-session question, or needs the other instance's filesystem/network access to finish. Also use when something in the repo looks like it changed without your involvement -- git history moved unexpectedly, a commit or push you didn't make -- that's exactly the failure mode this file exists to catch. Do NOT use for user-facing changelog/release notes (a different file/purpose) or for routine single-session work with no cross-instance dependency."
---

# handoff

`HANDOFF.md` is the only channel between the two Claude Code instances that
work this repo (one on Ashwin's Windows/cloud session, one on the physical
Mac mini with real filesystem + network egress). It is not real-time — each
instance only sees it when invoked. This skill exists because the protocol
has enough small rules that skipping one silently forks history or loses a
thread, and because "read CLAUDE.md's prose reminder" is easy to skip under
task pressure in a way that a triggered skill is not.

## When to invoke

**Read HANDOFF.md (near the start of a session) when:**
- The task touches civic/data pipelines that run on a schedule (mayors,
  governors, Congress, Cabinet, House leadership, football standings,
  mktcap) — another instance may already be mid-thread on the same issue.
- You're about to diagnose something that "looks broken" — check whether
  it's already a known, tracked issue before re-diagnosing from scratch.
- **You notice repo state that doesn't match what you expect** — local
  `main` moved without you pushing, a commit exists under a hash you didn't
  create, deployments you didn't trigger. This is a real, observed failure
  mode (see the 2026-08-02 security-fix session, where a `pull --rebase`
  neither instance in that conversation initiated rewrote a commit hash
  mid-session) — when you see it, say so plainly and check `HANDOFF.md`
  rather than silently absorbing it.

**Append an entry (near the end of a session) when:**
- You changed anything under `mac-mini-jobs/`, a GitHub Action the mini also
  depends on, or any script the other instance's cron jobs call.
- You hit a question only the other instance can answer (needs mini
  filesystem access, needs live network egress you don't have, needs the
  user to check something in person on the mini).
- You're leaving a thread open — a bug half-diagnosed, a fix pushed but not
  yet verified live, a data anomaly reported but not yet root-caused.

Do NOT use this for release notes, user-facing changelogs, or single-session
work with no cross-instance dependency — that's just noise in a channel
meant for two AI instances coordinating blind.

## What this skill assumes

- The repo is `github.com/ashwin-desikan/metro-power-rankings`, default
  branch `main`, no `master`.
- The mini's own weekly automation does `git merge --ff-only origin/main`
  before its commits — history must stay **linear**. A non-fast-forward
  push from either side breaks the other's automation, not just tidiness.
- Closed threads eventually get moved out to `HANDOFF-ARCHIVE-YYYY-MM.md`
  (see `HANDOFF-ARCHIVE-2026-07.md` for the existing pattern) — this is a
  judgment call for genuinely-resolved threads, not a fixed cadence; don't
  archive something with an open question still attached to it.
- Every commit that touches only `HANDOFF.md` (or other docs/scripts,
  no `app/`/`lib/`/`public/`) should carry `[vercel skip]`.

## The protocol (verbatim from the file's own header — follow it exactly)

1. **Before editing:** `git pull --ff-only` on `main`.
2. **Append** a new entry under a dated `## YYYY-MM-DD — <from> → <to>`
   heading. Don't rewrite others' entries — add yours below, even if it's a
   continuation of an existing thread (use a `**Update (same day)** —`
   sub-paragraph inside that day's entry for same-day follow-ups, matching
   the file's existing style).
3. **After editing:** commit with `[vercel skip]` in the message, then push.
4. Keep the **most recent open questions near the bottom** so they're easy
   for the other instance to find without reading the whole file.

`<from> → <to>` is always `windows → mini` or `mini → windows` — write from
the perspective of who is leaving the note for whom.

## How to run

This isn't a script — it's a read/append/push sequence:

```
git pull --ff-only origin main          # step 1, always, before touching the file
```

Then read (usually just the tail — the most recent dated headings and any
"Open question for..." subsections) or append via the Edit/Write tools
directly on `HANDOFF.md`, following the exact heading format above. Finish
with:

```
git add HANDOFF.md
git commit -m "docs: HANDOFF <short summary> [vercel skip]"
git push
```

## What to do at each phase

1. **On read:** don't just skim the top — open questions and unresolved
   threads are deliberately kept near the bottom (rule 4). Report back to
   the user (or factor into your own plan) any open thread that's relevant
   to the current task, even if the task wasn't originally framed as
   "check HANDOFF first."

2. **On append:** write the entry as if the other instance has zero context
   from this conversation — it only has what's in the file. State what you
   changed, why, what you verified vs. couldn't verify (per `CLAUDE.md`'s
   evidence rule — don't assert a live-data diagnosis you didn't actually
   confirm), and end with an explicit "Open question for the mini/windows"
   subsection if there is one, matching the file's existing convention.

3. **Before pushing:** re-run `git pull --ff-only` if any time has passed
   since step 1 — the whole point of this file is that the other instance
   may be committing concurrently. A non-ff-only pull or a force-push here
   is the exact failure this protocol exists to prevent; if `--ff-only`
   fails, stop and reconcile by hand rather than forcing past it.

## Failure recipes

| Symptom                                                | Likely cause                                                     | First move |
|-----------------------------------------------------------|----------------------------------------------------------------------|------------|
| `git pull --ff-only` fails                                 | The other instance (or the user) committed concurrently             | Read what landed before merging anything by hand — don't force. |
| Local `main` doesn't match what you expect / a commit hash changed | Another actor rebased and pushed while you were working — this has actually happened | Verify with `git reflog`, `git merge-base --is-ancestor`, and `git log origin/main`; write it up in a HANDOFF entry rather than silently re-doing work. |
| You can't verify a live-data or network claim                | You're on the instance without confirmed egress                       | Say so explicitly in the entry; don't report a guess as a diagnosis (`CLAUDE.md` evidence rule). |
| An open question sits unanswered for a long time            | The other instance hasn't been invoked, or missed it                  | Don't assume it was seen — re-surface it near the bottom on your next entry. |

## What this skill does NOT do

- Does NOT replace `CLAUDE.md` — that's standing project instruction, this
  is the live/dated coordination log.
- Does NOT archive old threads automatically — archiving is a manual,
  judgment-based move to `HANDOFF-ARCHIVE-YYYY-MM.md`.
- Does NOT authorize skipping `git pull --ff-only` under any circumstance,
  including "I'm in a hurry."
- Does NOT cover communication with the user directly — this is
  instance-to-instance only.

## Source of truth

The protocol block at the top of `HANDOFF.md` itself is authoritative — if
it and this file ever disagree, the file wins and this SKILL.md is stale.

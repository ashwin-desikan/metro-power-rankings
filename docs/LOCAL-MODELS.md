# Local and small models: Jev, Ollama, and when a session must use them

Ruling by Ashwin, 2026-09-22: "we should be using Jev as much as we can, just like Ollama". This
document is the protocol. It is mirrored in three places so every session on every surface sees it:
`~/.claude/CLAUDE.md` (every Claude Code and Cowork session on this machine), the repo `CLAUDE.md`
(pointer to this file), and Notion Decisions and Data sources (Citizen of Nowhere workspace).
HANDOFF.md carries the run log; Notion carries the state.

## The inventory on this machine

| Utility | What it is | How a session reaches it | Cost | Good at | Never for |
|---|---|---|---|---|---|
| **Jev** (TypeSafe System One, `jev-latest`) | A judgment model: given state plus a typed question (choice over candidates, yes/no, score), it returns the answer and a calibrated probability. It does not generate text or explain. | HTTPS `https://api.typesafe.ai/v1/systemone`; key in env `TYPESAFE_API_KEY` or a gitignored `typesafe_key.txt` beside the script. Skill: `typesafe-ai` plugin (`~/.claude/plugins/cache/typesafe-ai`), live docs at https://docs.typesafe.ai/llms.txt. Worked integrations: `scripts/mktcap/jev_metro_pilot.py`, `scripts/apifootball/jev_club_pilot.py`. | $0.042 per million input tokens, output free (verified 2026-09-22). The full 5,531-row metro audit cost $0.43; 330 club resolutions cost $0.02. p50 latency about 580 ms. | Choosing among candidates code retrieved; abstaining ("none") with a probability you can gate on; auditing curated labels; routing, ranking, extraction-by-selection. | Free text, summaries, code, anything without a fixed answer set, and anything applied to data without a confidence gate and a human. |
| **Ollama `llama3.1:8b`** | An 8B general model running locally (4.9 GB, no network, no cost). | In Cowork sessions: the `ollama-mcp` tools (`local_llm_chat`, health check, model list). From scripts on the Windows host: `http://localhost:11434/api/chat`. Not reachable from the cloud container or the Cowork device VM (localhost is the host's). | Free; a few seconds per call. | Mechanical, low-stakes text: bulk reformatting, tagging and classification with an obvious answer, short factual summaries of text you hand it, boilerplate drafts you will edit, commit-message drafts from a diff, log and test-output summaries. | Facts from its own memory, cross-file reasoning, code generation or debugging, financial or job content, client-facing or public writing, anything nuanced. If its output looks wrong, redo it yourself and say so. |
| **Ollama `nomic-embed-text`** | A local embedding model (274 MB). | `http://localhost:11434/api/embeddings` on the host. | Free. | Candidate retrieval before a Jev or human judgment (nearest names, near-duplicate rows, "which existing row is this feed item about"), clustering, dedupe. | Ranking by itself. Embeddings propose candidates; they never decide. |
| **Claude (this session)** | The frontier model. | You are it. | The expensive tier. | Reasoning, design, code, cross-file work, anything with a silent failure mode, final review. | Bulk mechanical work a cheaper tier can do, and judgment calls a typed Jev question can answer better and more cheaply. |

## The ladder: cheapest thing that is correct

Every task that touches many rows, many names, or many documents goes down this ladder, in
order. Stop at the first rung that solves it.

1. **Pure code.** Exact match after normalisation, consistency checks against the rest of the
   table, string containment, deterministic rules. Measured twice on 2026-09-22: a free check
   found 9 of the 15 metro-label errors Jev found and 6 that Jev missed; lexical top-1 already
   resolved 82.7% of the hard club names. Run the free method first and read its numbers.
2. **Embeddings (nomic-embed-text) or lexical retrieval** to produce a short candidate list
   (top 30) for anything that survives rung 1. Retrieval recall is a ceiling on everything
   after it; measure it (`--recall`) before spending a cent.
3. **Jev** for the judgment over that candidate list, with `none` always an option, a
   confidence threshold (0.90 is the standing default; 0.95 where a wrong link is expensive),
   and an eval set with held-out truth before any live use. Jev's value is calibrated
   abstention: code cannot say "none of these", Jev can, and the live backlogs are mostly
   things we have never curated.
4. **Ollama llama3.1:8b** for mechanical text around the pipeline: turning a results table into
   a paragraph for HANDOFF, tagging rows into obvious buckets, reformatting, first drafts of
   boilerplate. Delegate without asking; verify by reading the output.
5. **Claude** for what is left: the design, the code, the review, the ruling summary for
   Ashwin.

## Protocol for a Jev integration

This is the shape both existing pilots follow, and any new one copies it.

1. **Measurement before automation.** A pilot script has `--self-test` (pure logic, no key),
   `--recall` (retrieval ceiling and the free baseline, no API spend), `--eval` on a truth set
   with the answer held out of the prompt, `--report`, and `--queue` or `--audit` for the live
   backlog as a dry run. **No `--write`, and none is added later without Ashwin's ruling.**
2. **Truth from our own data.** Held-out pairs the workbook already carries (api_name to canonical
   club; stored metro to city) are the eval set. Report coverage and precision at the threshold,
   the negative-set wrong-link rate, and calibration (ECE, and whether the top bin is
   overconfident). A raw accuracy number alone is not a result.
3. **Jev never writes.** Its confident answers become a question for a human (a `RULINGS`-style
   CSV, a Notion Backlog row, a HANDOFF list). Every wrong link it has produced (Grimsby Borough
   as Grimsby Town at 0.95; ICU Medical to San Diego) was caught only because nothing applied it.
4. **Audit mode is the better use.** Re-asking about rows that already carry a curated label,
   with the stored label in the shortlist, finds bad stored labels at 0.3% of rows; that is
   what it did on `mktcap_geo`. Prefer auditing curation over replacing it.
5. **Cost and latency are logged** in the HANDOFF entry for every run: rows, dollars, p50, the
   threshold used, and the confusion counts. Keys stay in env or a gitignored file; the
   `.gitignore` beside the script is part of the deliverable.
6. **Notion.** A pilot gets a Backlog row (Open while measuring, Done with the numbers), a
   Decisions row for the threshold and ritual, and the Data sources row for the upstream feed
   gains any quirk the pilot exposed.

## Protocol for Ollama

1. In a Cowork session with `ollama-mcp` connected, use `local_llm_chat` directly for the
   rung-4 jobs above. Do not ask first; do read the result before using it.
2. From a script on the host, call `localhost:11434`. Never from Vercel, the mini's cloud jobs, or
   the cloud container: those cannot see the host.
3. Never hand it a task whose failure is silent. Reformatting a table is loud (you see the table).
   Summarising a legal or financial document is silent. Keep the split.
4. If the model is not running, `ollama_health_check` then `start_ollama_server`; if it is still
   down, do the job yourself and say so in the reply.

## Why (the needs, so nobody has to re-derive them)

- **Cost.** Frontier tokens are the scarce resource in this project. A 5,000-row judgment pass
  through Claude is hours and dollars; through Jev it is 55 minutes and $0.43; through code it
  is free. The ladder exists to spend frontier tokens only on frontier work.
- **Calibrated abstention.** The site's data problems are mostly "is this the same thing or a
  new thing". Code cannot abstain; Jev returns a probability we can gate; that gate is what
  keeps a wrong link out of the workbook.
- **Auditing at scale.** Curated labels drift (metro paste errors, Cur. Name paste errors).
  A cheap model that re-checks every row and flags confident disagreements is the only way to
  audit 10,000 rows without reading 10,000 rows.
- **Local means private and free.** Ollama runs on the machine: no key, no egress, no bill.
  Anything mechanical that touches personal documents (CVs, job search, notes) belongs there
  before it belongs anywhere else.
- **Ashwin is learning these tools through use.** Every session that uses them writes down the
  numbers and the pattern in HANDOFF and Notion, so the next session and Ashwin can see what
  worked, what it cost, and where the model was wrong.

## Standing measurements (update when a run changes them)

| Date | Run | Result |
|---|---|---|
| 2026-09-22 | Jev metro pilot, HARD 702 rows | 84% pick accuracy; at 0.90: 4 confident disagreements in 446, 3 were bad stored labels |
| 2026-09-22 | Jev metro audit, all 5,531 `mktcap_geo` rows | agree 88.4%, disagree 0.27% (15), unsure 10.0%, $0.43; 10 of 15 real label errors; free consistency check found 9 of those 15 plus 6 more |
| 2026-09-22 | Jev club resolver, 330 rows | HARD coverage 71.3% precision 95.3% at 0.90; NEGATIVE wrong-link 7.5%; lexical top-1 82.7% but 0% abstention; recall@30 99.3%; $0.02 |
| 2026-09-22 | Reep identity crosswalk (pure code + elimination, no model) | 8,159 of 9,956 Lookup rows matched; the remaining 212 rulings are a candidate list for a Jev pass with the current-table evidence in the state |

## Where to use them next (already on the Backlog)

- The 212 open Reep rulings and the 3,465-club api-football backlog: retrieval from
  `football_identity_alias`, Jev choice with `none`, proposals to Ashwin. Never a write.
- Cur. Name lineage calls (8 both-current cases) and the 51 stale-name rows: a Jev audit
  question with the current table as state.
- HANDOFF prose from results tables, Notion Notes fields, commit-message drafts: Ollama.

#!/usr/bin/env python3
"""RETIRED, 2026-09-24 (Ashwin's ruling).

Supabase's public.team_valuations is now the ONLY source of truth for team
valuations. OtherLeagues.xlsx's "Team Valuations" sheet is no longer read,
written, or involved in this pipeline in any way -- this script used to
truncate the whole table and reload it from that sheet, which is exactly the
workflow the ruling ended. The workbook still feeds OTHER pipelines this repo
owns (WNBA, CFL, AFL/NRL, EuroLeague, CWS) -- only valuations moved off it.

Use scripts/valuations/upsert_team_valuations.py instead: it upserts by
(team, league, year) from a CSV, never deletes or truncates, is dry-run by
default, and refuses any row missing a source or a method.

This file is kept (rather than deleted) so a stale doc, cron entry or muscle-
memory command that still invokes it gets a clear refusal instead of either a
silent no-op or, worse, resurrecting the truncate-and-reload behaviour.
"""
import sys

if __name__ == "__main__":
    sys.exit(
        "REFUSING TO RUN: scripts/valuations/sync_team_valuations.py is retired "
        "as of 2026-09-24. OtherLeagues.xlsx is no longer the source of truth "
        "for team valuations -- Supabase's public.team_valuations is. "
        "Use scripts/valuations/upsert_team_valuations.py instead."
    )

#!/usr/bin/env python3
"""Seed the F1 Supabase mirror tables from the local CSVs (one-time / re-seed).
Runs on a machine with internet + the F1 Data folder.

  pip install supabase pandas
  export SUPABASE_URL="https://nmprqkmymrdknffwnuur.supabase.co"
  export SUPABASE_SERVICE_KEY="<service_role key>"
  python load_f1_to_supabase.py            # uses ./data
  python load_f1_to_supabase.py <data_dir>

Full replace per table, so it is safe to re-run.
"""
import sys
from f1_source import seed_from_csvs

if __name__ == "__main__":
    seed_from_csvs(sys.argv[1] if len(sys.argv) > 1 else None)

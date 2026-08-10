"""Compute the metro Score in Python instead of Excel.

Stage 1 of the migration: the engine exists and is proven against the
workbook's own cached column BG, but nothing consumes it yet. scripts/extract.py
still reads BG. See the scoping plan in the OneDrive project folder.

    python scripts/metro_score/parity.py --self-test
    python scripts/metro_score/parity.py            # against MetroAreas.xlsx
"""
from .weights import Weights, WeightsError, load as load_weights  # noqa: F401
from .sources import Workbook, load as load_workbook  # noqa: F401
from .score import Engine, derived_columns, score_terms, total, TERM_ORDER  # noqa: F401

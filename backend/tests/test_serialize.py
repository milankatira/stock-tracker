"""Unit tests for normalization helpers — the JSON-safety contract."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from app.services.market_data import _clean, _statement_periods


def test_clean_maps_nan_to_none():
    assert _clean(float("nan")) is None
    assert _clean(np.nan) is None


def test_clean_maps_inf_to_none():
    assert _clean(math.inf) is None
    assert _clean(-math.inf) is None


def test_clean_maps_nat_to_none():
    assert _clean(pd.NaT) is None


def test_clean_unwraps_numpy_scalar():
    out = _clean(np.float64(3.5))
    assert out == 3.5 and isinstance(out, float)


def test_clean_passes_through_plain_values():
    assert _clean(42) == 42
    assert _clean("buy") == "buy"
    assert _clean(None) is None


def test_statement_periods_handles_empty():
    assert _statement_periods(None) == []
    assert _statement_periods(pd.DataFrame()) == []


def test_statement_periods_shapes_rows_and_cleans_nan():
    cols = pd.to_datetime(["2025-09-30"])
    df = pd.DataFrame({cols[0]: [100.0, np.nan]}, index=["Revenue", "Net Income"])
    periods = _statement_periods(df)
    assert periods[0]["date"] == "2025-09-30"
    assert periods[0]["Revenue"] == 100.0
    assert periods[0]["Net Income"] is None  # NaN -> None

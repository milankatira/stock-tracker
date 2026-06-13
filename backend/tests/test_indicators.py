"""Pure unit tests for technical indicators."""

from __future__ import annotations

import pytest

from app.services import indicators as ind


def test_sma_basic():
    assert ind.sma([1, 2, 3, 4], 2) == 3.5
    assert ind.sma([1, 2], 5) is None


def test_ema_constant_series_equals_constant():
    assert ind.ema([5.0] * 30, 10) == pytest.approx(5.0)


def test_ema_tracks_toward_new_level_after_step_up():
    # After a step from 10 -> 20, EMA sits between the old and new level,
    # above its seed (10) as it converges upward.
    ema = ind.ema([10.0] * 20 + [20.0] * 20, 10)
    assert 10.0 < ema < 20.0


def test_rsi_all_gains_is_100():
    assert ind.rsi([float(i) for i in range(1, 30)], 14) == 100.0


def test_rsi_needs_enough_history():
    assert ind.rsi([1, 2, 3], 14) is None


def test_rsi_midrange_for_choppy_series():
    closes = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11]
    r = ind.rsi(closes, 14)
    assert r is not None and 30 < r < 70


def test_position_52w():
    assert ind.position_52w([10, 20, 30]) == 100.0  # last == max
    assert ind.position_52w([30, 20, 10]) == 0.0     # last == min
    assert ind.position_52w([10, 20, 15]) == pytest.approx(50.0)


def test_pct_change():
    assert ind.pct_change([100, 110], 1) == pytest.approx(10.0)
    assert ind.pct_change([100], 1) is None


def test_returns_block_ytd_and_trailing():
    dates = ["2025-12-31", "2026-01-02", "2026-06-12"]
    closes = [100.0, 100.0, 120.0]
    block = ind.returns_block(dates, closes)
    assert block["1d"] == pytest.approx(20.0)
    # YTD anchors on first 2026 close (100) -> +20%
    assert block["ytd"] == pytest.approx(20.0)


def test_volatility_zero_for_flat_series():
    assert ind.annualized_volatility([100, 100, 100, 100]) == 0.0

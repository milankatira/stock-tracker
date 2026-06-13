"""Technical indicators — pure functions, no I/O.

All take a chronological (oldest -> newest) list of closing prices and return a
single latest value or ``None`` when there is insufficient history. Kept free of
pandas/network so they are trivially unit-testable and reusable by the scorer.
"""

from __future__ import annotations

import math


def sma(closes: list[float], window: int) -> float | None:
    if len(closes) < window or window <= 0:
        return None
    return sum(closes[-window:]) / window


def ema(closes: list[float], window: int) -> float | None:
    if len(closes) < window or window <= 0:
        return None
    k = 2 / (window + 1)
    seed = sum(closes[:window]) / window
    value = seed
    for price in closes[window:]:
        value = price * k + value * (1 - k)
    return value


def rsi(closes: list[float], period: int = 14) -> float | None:
    """Wilder's RSI. Returns None if fewer than ``period + 1`` closes."""
    if len(closes) < period + 1:
        return None
    gains = losses = 0.0
    for i in range(1, period + 1):
        delta = closes[i] - closes[i - 1]
        gains += max(delta, 0.0)
        losses += max(-delta, 0.0)
    avg_gain, avg_loss = gains / period, losses / period
    for i in range(period + 1, len(closes)):
        delta = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(delta, 0.0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-delta, 0.0)) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def position_52w(closes: list[float]) -> float | None:
    """Where the latest close sits in its range, 0 (low) .. 100 (high)."""
    if len(closes) < 2:
        return None
    window = closes[-252:]
    lo, hi = min(window), max(window)
    if hi == lo:
        return 50.0
    return (window[-1] - lo) / (hi - lo) * 100


def annualized_volatility(closes: list[float]) -> float | None:
    """Annualized stdev of daily returns (252 trading days), as a fraction."""
    if len(closes) < 3:
        return None
    rets = [
        (closes[i] / closes[i - 1] - 1)
        for i in range(1, len(closes))
        if closes[i - 1]
    ]
    if len(rets) < 2:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return math.sqrt(var) * math.sqrt(252)


def pct_change(closes: list[float], bars_back: int) -> float | None:
    """Percent change over ``bars_back`` bars (trading days for daily data)."""
    if bars_back <= 0 or len(closes) <= bars_back:
        return None
    past, last = closes[-1 - bars_back], closes[-1]
    if not past:
        return None
    return (last / past - 1) * 100


def returns_block(dates: list[str], closes: list[float]) -> dict[str, float | None]:
    """Calendar-anchored returns. ``dates`` are ISO strings parallel to ``closes``."""
    if not closes:
        return {}
    last = closes[-1]
    out: dict[str, float | None] = {
        "1d": pct_change(closes, 1),
        "1w": pct_change(closes, 5),
        "1mo": pct_change(closes, 21),
        "3mo": pct_change(closes, 63),
        "6mo": pct_change(closes, 126),
        "1y": pct_change(closes, 252),
    }
    # YTD: first close on/after Jan 1 of the latest year.
    year = dates[-1][:4]
    ytd_base = next((c for d, c in zip(dates, closes) if d[:4] == year and c), None)
    out["ytd"] = ((last / ytd_base - 1) * 100) if ytd_base else None
    return out

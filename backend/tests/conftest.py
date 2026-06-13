"""Test fixtures.

Unit tests mock the upstream at the `yf.Ticker` boundary (`market_data._ticker`)
so the full service + router stack — normalization, NaN handling, HTTP mapping —
is exercised without touching the network (which is slow, flaky and rate-limited).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.cache import cache
from app.main import app
from app.services import market_data


class FakeFastInfo:
    def __init__(self, data: dict) -> None:
        self._d = data

    def keys(self):
        return self._d.keys()

    def __getitem__(self, k):
        return self._d[k]


class FakeTicker:
    """Stand-in for yfinance.Ticker with a realistic AAPL-shaped payload."""

    def __init__(self, symbol: str) -> None:
        self.ticker = symbol

    @property
    def info(self) -> dict:
        return {
            "symbol": "AAPL",
            "longName": "Apple Inc.",
            "shortName": "Apple",
            "sector": "Technology",
            "industry": "Consumer Electronics",
            "country": "United States",
            "website": "https://apple.com",
            "fullTimeEmployees": 166000,
            "longBusinessSummary": "Apple designs and sells consumer electronics.",
            "currentPrice": 291.13,
            "marketCap": 4275929874432,
            "enterpriseValue": 4300000000000,
            "trailingPE": 35.2,
            "forwardPE": 30.3,
            "priceToBook": 40.1,
            "priceToSalesTrailing12Months": 9.5,
            "trailingPegRatio": 2.6,
            "profitMargins": 0.27,
            "operatingMargins": 0.30,
            "grossMargins": 0.46,
            "returnOnEquity": 1.41,
            "returnOnAssets": 0.22,
            "trailingEps": 8.27,
            "revenueGrowth": 0.166,
            "earningsGrowth": 0.12,
            "totalCash": 50000000000,
            "totalDebt": 100000000000,
            "debtToEquity": 79.5,
            "currentRatio": 0.9,
            "freeCashflow": 101090746368,
            "dividendYield": 0.37,
            "dividendRate": 1.0,
            "payoutRatio": 0.15,
            "beta": 1.086,
            "recommendationKey": "buy",
            "numberOfAnalystOpinions": 40,
            "targetMeanPrice": 312.71,
            "targetLowPrice": 215.0,
            "targetHighPrice": 400.0,
            "targetMedianPrice": 310.0,
        }

    @property
    def fast_info(self) -> FakeFastInfo:
        return FakeFastInfo(
            {
                "currency": "USD",
                "exchange": "NMS",
                "lastPrice": 291.13,
                "previousClose": 295.80,
                "dayHigh": 297.14,
                "dayLow": 289.62,
                "open": 296.03,
                "yearHigh": 317.40,
                "yearLow": 195.07,
                "fiftyDayAverage": 285.49,
                "twoHundredDayAverage": 266.87,
                "lastVolume": 38742100,
                "marketCap": 4275930023995.6,
            }
        )

    @property
    def recommendations(self) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "period": ["0m", "-1m"],
                "strongBuy": [7, 7],
                "buy": [23, 23],
                "hold": [15, 15],
                "sell": [1, 1],
                "strongSell": [2, 2],
            }
        )

    def history(self, period: str, interval: str) -> pd.DataFrame:
        if period in ("1y", "2y"):
            # ~2y of trading days, gentle uptrend -> SMA50/200, RSI, 1y return all
            # computable (1y return needs >252 bars).
            n = 520
            idx = pd.bdate_range(end="2026-06-12", periods=n)
            closes = [200.0 + i * 0.35 for i in range(n)]
            return pd.DataFrame(
                {
                    "Open": closes,
                    "High": [c + 1 for c in closes],
                    "Low": [c - 1 for c in closes],
                    "Close": closes,
                    "Volume": [40_000_000] * n,
                },
                index=idx,
            )
        idx = pd.to_datetime(["2026-06-10", "2026-06-11"])
        # Second bar carries a NaN to prove the cleaner maps it to null.
        return pd.DataFrame(
            {
                "Open": [290.0, 291.0],
                "High": [293.0, np.nan],
                "Low": [289.0, 290.0],
                "Close": [292.0, 291.0],
                "Volume": [40000000, 38000000],
            },
            index=idx,
        )

    @property
    def earnings_dates(self) -> pd.DataFrame:
        idx = pd.to_datetime(["2026-07-30", "2026-01-29"])
        return pd.DataFrame(
            {"EPS Estimate": [2.4, 2.1], "Reported EPS": [np.nan, 2.18],
             "Surprise(%)": [np.nan, 0.038]},
            index=idx,
        )

    @property
    def earnings_estimate(self) -> pd.DataFrame:
        return pd.DataFrame(
            {"avg": [2.4, 9.5], "low": [2.2, 9.0], "high": [2.6, 10.0],
             "numberOfAnalysts": [25, 30], "growth": [0.1, 0.12]},
            index=["0q", "0y"],
        )

    @property
    def eps_trend(self) -> pd.DataFrame:
        return pd.DataFrame(
            {"current": [2.4], "7daysAgo": [2.39], "30daysAgo": [2.35]},
            index=["0q"],
        )

    @property
    def eps_revisions(self) -> pd.DataFrame:
        return pd.DataFrame(
            {"upLast7days": [3], "upLast30days": [5], "downLast30days": [1]},
            index=["0q"],
        )

    @property
    def growth_estimates(self) -> pd.DataFrame:
        return pd.DataFrame({"stockTrend": [0.12], "indexTrend": [0.08]}, index=["0q"])

    @property
    def institutional_holders(self) -> pd.DataFrame:
        return pd.DataFrame(
            {"Holder": ["Vanguard", "BlackRock"], "pctHeld": [0.08, 0.07],
             "Shares": [1_200_000_000, 1_050_000_000]}
        )

    @property
    def major_holders(self) -> pd.DataFrame:
        return pd.DataFrame(
            {"Value": [0.0006, 0.62, 5800]},
            index=["insidersPercentHeld", "institutionsPercent", "institutionsCount"],
        )

    @property
    def insider_transactions(self) -> pd.DataFrame:
        return pd.DataFrame(
            {"Insider": ["Tim Cook"], "Transaction": ["Sale"], "Shares": [100000]}
        )

    @property
    def dividends(self) -> pd.Series:
        idx = pd.to_datetime(["2026-02-09", "2026-05-11"])
        return pd.Series([0.26, 0.27], index=idx, name="Dividends")

    @property
    def splits(self) -> pd.Series:
        idx = pd.to_datetime(["2020-08-31"])
        return pd.Series([4.0], index=idx, name="Stock Splits")

    @property
    def income_stmt(self) -> pd.DataFrame:
        cols = pd.to_datetime(["2025-09-30", "2024-09-30"])
        return pd.DataFrame(
            {cols[0]: [400000.0, np.nan], cols[1]: [380000.0, 95000.0]},
            index=["Total Revenue", "Net Income"],
        )

    @property
    def news(self) -> list[dict]:
        return [
            {
                "id": "1",
                "content": {
                    "title": "Apple ships new chip",
                    "summary": "A summary.",
                    "pubDate": "2026-06-13T08:33:55Z",
                    "provider": {"displayName": "Reuters"},
                    "canonicalUrl": {"url": "https://example.com/a"},
                },
            }
        ]


class EmptyTicker:
    """Stand-in for a garbage/unknown symbol — Yahoo returns sparse data."""

    def __init__(self, symbol: str) -> None:
        self.ticker = symbol

    @property
    def info(self) -> dict:
        return {"trailingPegRatio": None}

    @property
    def fast_info(self) -> FakeFastInfo:
        return FakeFastInfo({})

    def history(self, period: str, interval: str) -> pd.DataFrame:
        return pd.DataFrame()


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def fake_upstream(monkeypatch):
    monkeypatch.setattr(market_data, "_ticker", FakeTicker)


@pytest.fixture
def empty_upstream(monkeypatch):
    monkeypatch.setattr(market_data, "_ticker", EmptyTicker)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)

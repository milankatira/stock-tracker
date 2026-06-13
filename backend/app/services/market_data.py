"""Market data service — wraps yfinance and normalizes it into our contracts.

Design:
* `_info()` performs the single heavy `.info` scrape ONCE per symbol (long TTL)
  and every info-derived endpoint (profile, fundamentals, analyst targets)
  projects from that cached dict instead of re-scraping.
* `/quote` uses the cheap `fast_info` path on a short TTL.
* All pandas values pass through `_clean()` so NaN / NaT / Inf become JSON-safe
  `None` — those are not valid JSON and otherwise produce 500s or invalid bodies.
* Garbage tickers do NOT raise upstream; Yahoo returns a near-empty `.info`, so
  we validate presence of identifying fields and raise `SymbolNotFound` (404).
"""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

import pandas as pd
import yfinance as yf

from app import config
from app.cache import cache


class SymbolNotFound(Exception):
    """Raised when the upstream returns no usable data for a symbol."""


class UpstreamError(Exception):
    """Raised when the upstream data provider fails."""


# --- normalization --------------------------------------------------------
def _clean(value: Any) -> Any:
    """Map non-JSON-safe scalars (NaN, NaT, Inf) to None; pass through the rest."""
    if value is None:
        return None
    if isinstance(value, float):
        return None if (math.isnan(value) or math.isinf(value)) else value
    if value is pd.NaT:
        return None
    try:
        if pd.isna(value):  # numpy NaN, pandas NaT, etc.
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):  # numpy scalar -> python scalar
        return value.item()
    return value


def _get(info: dict, key: str) -> Any:
    return _clean(info.get(key))


def _statement_periods(df: pd.DataFrame | None) -> list[dict]:
    """Financial statement DataFrame (rows=line items, cols=dates) -> period rows."""
    if df is None or df.empty:
        return []
    periods: list[dict] = []
    for col in df.columns:
        row: dict[str, Any] = {"date": str(getattr(col, "date", lambda: col)())}
        for line_item, value in df[col].items():
            row[str(line_item)] = _clean(value)
        periods.append(row)
    return periods


# --- upstream fetchers (cached) ------------------------------------------
def _ticker(symbol: str) -> yf.Ticker:
    return yf.Ticker(symbol)


def _fetch(key: str, ttl: int, fn: Callable[[], Any]) -> Any:
    # Cache SymbolNotFound briefly so garbage tickers don't hammer the upstream.
    try:
        return cache.get_or_fetch(key, ttl, fn, error_types=(SymbolNotFound,), error_ttl=60)
    except SymbolNotFound:
        raise
    except Exception as exc:  # noqa: BLE001 — wrap any upstream/library failure
        raise UpstreamError(str(exc)) from exc


def _info(symbol: str) -> dict:
    def fetch() -> dict:
        info = _ticker(symbol).info or {}
        identifies = info.get("longName") or info.get("shortName")
        prices = info.get("currentPrice") or info.get("regularMarketPrice")
        if not identifies and not prices:
            raise SymbolNotFound(symbol)
        return info

    return _fetch(f"info:{symbol}", config.INFO_TTL, fetch)


def _fast(symbol: str) -> dict:
    def fetch() -> dict:
        fi = _ticker(symbol).fast_info
        data = {k: fi[k] for k in fi.keys()}
        if not data.get("lastPrice"):
            raise SymbolNotFound(symbol)
        return data

    return _fetch(f"fast:{symbol}", config.QUOTE_TTL, fetch)


# --- builders -------------------------------------------------------------
def get_quote(symbol: str) -> dict:
    fi = _fast(symbol)
    last = _clean(fi.get("lastPrice"))
    prev = _clean(fi.get("previousClose"))
    change = change_pct = None
    if last is not None and prev:
        change = last - prev
        change_pct = (change / prev) * 100
    return {
        "symbol": symbol,
        "currency": fi.get("currency"),
        "exchange": fi.get("exchange"),
        "last_price": last,
        "previous_close": prev,
        "change": change,
        "change_percent": change_pct,
        "day_high": _clean(fi.get("dayHigh")),
        "day_low": _clean(fi.get("dayLow")),
        "open": _clean(fi.get("open")),
        "year_high": _clean(fi.get("yearHigh")),
        "year_low": _clean(fi.get("yearLow")),
        "fifty_day_average": _clean(fi.get("fiftyDayAverage")),
        "two_hundred_day_average": _clean(fi.get("twoHundredDayAverage")),
        "volume": _clean(fi.get("lastVolume")),
        "market_cap": _clean(fi.get("marketCap")),
    }


def get_profile(symbol: str) -> dict:
    i = _info(symbol)
    return {
        "symbol": symbol,
        "name": _get(i, "longName") or _get(i, "shortName"),
        "sector": _get(i, "sector"),
        "industry": _get(i, "industry"),
        "country": _get(i, "country"),
        "website": _get(i, "website"),
        "employees": _get(i, "fullTimeEmployees"),
        "summary": _get(i, "longBusinessSummary"),
    }


def get_fundamentals(symbol: str) -> dict:
    i = _info(symbol)
    return {
        "symbol": symbol,
        "beta": _get(i, "beta"),
        "valuation": {
            "market_cap": _get(i, "marketCap"),
            "enterprise_value": _get(i, "enterpriseValue"),
            "trailing_pe": _get(i, "trailingPE"),
            "forward_pe": _get(i, "forwardPE"),
            "price_to_book": _get(i, "priceToBook"),
            "price_to_sales": _get(i, "priceToSalesTrailing12Months"),
            "peg_ratio": _get(i, "trailingPegRatio"),
        },
        "profitability": {
            "profit_margin": _get(i, "profitMargins"),
            "operating_margin": _get(i, "operatingMargins"),
            "gross_margin": _get(i, "grossMargins"),
            "return_on_equity": _get(i, "returnOnEquity"),
            "return_on_assets": _get(i, "returnOnAssets"),
            "trailing_eps": _get(i, "trailingEps"),
        },
        "growth": {
            "revenue_growth": _get(i, "revenueGrowth"),
            "earnings_growth": _get(i, "earningsGrowth"),
        },
        "financial_health": {
            "total_cash": _get(i, "totalCash"),
            "total_debt": _get(i, "totalDebt"),
            "debt_to_equity": _get(i, "debtToEquity"),
            "current_ratio": _get(i, "currentRatio"),
            "free_cashflow": _get(i, "freeCashflow"),
        },
        "dividend": {
            "dividend_yield": _get(i, "dividendYield"),
            "dividend_rate": _get(i, "dividendRate"),
            "payout_ratio": _get(i, "payoutRatio"),
        },
    }


def get_analysis(symbol: str) -> dict:
    """Analyst targets (from cached info) + recommendation trend table."""
    i = _info(symbol)
    current = _get(i, "currentPrice") or _get(i, "regularMarketPrice")
    mean = _get(i, "targetMeanPrice")
    upside = ((mean - current) / current * 100) if (mean and current) else None

    def fetch_trend() -> list[dict]:
        df = _ticker(symbol).recommendations
        if df is None or df.empty:
            return []
        out: list[dict] = []
        for _, r in df.iterrows():
            out.append(
                {
                    "period": str(r.get("period", "")),
                    "strong_buy": int(_clean(r.get("strongBuy")) or 0),
                    "buy": int(_clean(r.get("buy")) or 0),
                    "hold": int(_clean(r.get("hold")) or 0),
                    "sell": int(_clean(r.get("sell")) or 0),
                    "strong_sell": int(_clean(r.get("strongSell")) or 0),
                }
            )
        return out

    trend = _fetch(f"rec:{symbol}", config.SLOW_TTL, fetch_trend)
    return {
        "symbol": symbol,
        "recommendation": _get(i, "recommendationKey"),
        "number_of_analysts": _get(i, "numberOfAnalystOpinions"),
        "price_targets": {
            "current": current,
            "low": _get(i, "targetLowPrice"),
            "high": _get(i, "targetHighPrice"),
            "mean": mean,
            "median": _get(i, "targetMedianPrice"),
            "upside_percent": upside,
        },
        "trend": trend,
    }


def get_history(symbol: str, period: str, interval: str) -> dict:
    def fetch() -> list[dict]:
        df = _ticker(symbol).history(period=period, interval=interval)
        if df is None or df.empty:
            raise SymbolNotFound(symbol)
        bars: list[dict] = []
        for ts, row in df.iterrows():
            bars.append(
                {
                    "date": ts.isoformat(),
                    "open": _clean(row.get("Open")),
                    "high": _clean(row.get("High")),
                    "low": _clean(row.get("Low")),
                    "close": _clean(row.get("Close")),
                    "volume": _clean(row.get("Volume")),
                }
            )
        return bars

    bars = _fetch(f"hist:{symbol}:{period}:{interval}", config.SLOW_TTL, fetch)
    return {"symbol": symbol, "period": period, "interval": interval, "bars": bars}


_STATEMENTS = {
    "income": ("income_stmt", "quarterly_income_stmt"),
    "balance": ("balance_sheet", "quarterly_balance_sheet"),
    "cashflow": ("cashflow", "quarterly_cashflow"),
}


def get_financials(symbol: str, statement: str, freq: str) -> dict:
    attrs = _STATEMENTS[statement]
    attr = attrs[0] if freq == "annual" else attrs[1]

    def fetch() -> list[dict]:
        df = getattr(_ticker(symbol), attr)
        return _statement_periods(df)

    periods = _fetch(f"fin:{symbol}:{statement}:{freq}", config.SLOW_TTL, fetch)
    return {
        "symbol": symbol,
        "statement": statement,
        "frequency": freq,
        "periods": periods,
    }


def get_news(symbol: str, limit: int = 10) -> list[dict]:
    def fetch() -> list[dict]:
        raw = _ticker(symbol).news or []
        items: list[dict] = []
        for entry in raw[:limit]:
            c = entry.get("content", entry)
            provider = c.get("provider") or {}
            canonical = c.get("canonicalUrl") or {}
            items.append(
                {
                    "title": c.get("title"),
                    "publisher": provider.get("displayName"),
                    "published_at": c.get("pubDate"),
                    "summary": c.get("summary") or c.get("description"),
                    "url": canonical.get("url"),
                }
            )
        return items

    return _fetch(f"news:{symbol}:{limit}", config.NEWS_TTL, fetch)


def get_research(symbol: str) -> dict:
    """Consolidated report. Validate cheaply, then fan out remaining fetches.

    profile/fundamentals/analysis all reuse the single cached `.info`; quote and
    news are the only extra round-trips, so we run them in parallel rather than
    paying their latency serially.
    """
    _info(symbol)  # validates symbol up-front (raises 404) and warms the cache

    def _quote_best_effort() -> dict:
        # A halted/delisted name has a valid `.info` but no live price; the
        # report should still render rather than 404 the whole request.
        try:
            return get_quote(symbol)
        except SymbolNotFound:
            return {"symbol": symbol}

    with ThreadPoolExecutor(max_workers=4) as pool:
        f_quote = pool.submit(_quote_best_effort)
        f_news = pool.submit(get_news, symbol)
        f_analysis = pool.submit(get_analysis, symbol)
        quote = f_quote.result()
        news = f_news.result()
        analysis = f_analysis.result()
    return {
        "symbol": symbol,
        "quote": quote,
        "profile": get_profile(symbol),
        "fundamentals": get_fundamentals(symbol),
        "analysis": analysis,
        "news": news,
    }


# --- tabular normalizers --------------------------------------------------
def _records(df: pd.DataFrame | None) -> list[dict]:
    """Row-oriented DataFrame (0..n index) -> list of cleaned dicts."""
    if df is None or df.empty:
        return []
    out: list[dict] = []
    for _, row in df.iterrows():
        out.append({str(k): _clean(v) for k, v in row.items()})
    return out


def _indexed_records(df: pd.DataFrame | None, key: str) -> list[dict]:
    """Period-indexed DataFrame (e.g. '0q','+1q') -> list with index promoted."""
    if df is None or df.empty:
        return []
    out: list[dict] = []
    for idx, row in df.iterrows():
        rec = {key: str(idx)}
        rec.update({str(k): _clean(v) for k, v in row.items()})
        out.append(rec)
    return out


def _series_records(s: pd.Series | None, value_key: str) -> list[dict]:
    if s is None or s.empty:
        return []
    return [
        {"date": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
         value_key: _clean(v)}
        for ts, v in s.items()
    ]


# --- shared price history (for technicals / returns / scoring) -----------
def _price_history(symbol: str) -> tuple[list[str], list[float]]:
    """~2y of daily closes (oldest->newest), cached. Drives indicators.

    2y (not 1y) because SMA200 needs ~200 bars AND the trailing 1y return needs
    >252 bars — a 1y pull (~251 trading days) silently nulls the 1y return.
    """

    def fetch() -> tuple[list[str], list[float]]:
        df = _ticker(symbol).history(period="2y", interval="1d")
        if df is None or df.empty:
            raise SymbolNotFound(symbol)
        dates, closes = [], []
        for ts, row in df.iterrows():
            close = _clean(row.get("Close"))
            if close is None:
                continue
            dates.append(ts.isoformat())
            closes.append(float(close))
        return dates, closes

    return _fetch(f"closes1y:{symbol}", config.SLOW_TTL, fetch)


def compute_technicals(symbol: str) -> dict:
    from app.services import indicators as ind

    _dates, closes = _price_history(symbol)
    last = closes[-1] if closes else None
    sma50, sma200 = ind.sma(closes, 50), ind.sma(closes, 200)
    cross = None
    if sma50 is not None and sma200 is not None:
        cross = "golden" if sma50 > sma200 else "death"
    return {
        "symbol": symbol,
        "last_price": last,
        "sma_50": sma50,
        "sma_200": sma200,
        "ema_20": ind.ema(closes, 20),
        "rsi_14": ind.rsi(closes, 14),
        "above_sma_50": (last > sma50) if (last and sma50) else None,
        "above_sma_200": (last > sma200) if (last and sma200) else None,
        "ma_cross": cross,
        "position_52w": ind.position_52w(closes),
        "annualized_volatility": ind.annualized_volatility(closes),
        "data_points": len(closes),
    }


def compute_returns(symbol: str) -> dict:
    from app.services import indicators as ind

    dates, closes = _price_history(symbol)
    block = ind.returns_block(dates, closes)
    return {"symbol": symbol, **block}


def get_earnings(symbol: str) -> dict:
    def fetch() -> dict:
        t = _ticker(symbol)
        return {
            "symbol": symbol,
            "upcoming": _records(t.earnings_dates)[:8],
            "estimates": _indexed_records(t.earnings_estimate, "period"),
            "eps_trend": _indexed_records(t.eps_trend, "period"),
            "eps_revisions": _indexed_records(t.eps_revisions, "period"),
            "growth_estimates": _indexed_records(t.growth_estimates, "period"),
        }

    return _fetch(f"earn:{symbol}", config.SLOW_TTL, fetch)


def get_holders(symbol: str) -> dict:
    def fetch() -> dict:
        t = _ticker(symbol)
        major = {}
        mh = t.major_holders
        if mh is not None and not mh.empty and "Value" in mh.columns:
            major = {str(k): _clean(v) for k, v in mh["Value"].items()}
        return {
            "symbol": symbol,
            "summary": major,
            "institutional": _records(t.institutional_holders)[:15],
            "insider_transactions": _records(t.insider_transactions)[:15],
        }

    return _fetch(f"hold:{symbol}", config.SLOW_TTL, fetch)


def get_dividends(symbol: str) -> dict:
    def fetch() -> dict:
        t = _ticker(symbol)
        return {
            "symbol": symbol,
            "dividends": _series_records(t.dividends, "amount"),
            "splits": _series_records(t.splits, "ratio"),
        }

    return _fetch(f"div:{symbol}", config.SLOW_TTL, fetch)


def get_batch_quotes(symbols: list[str]) -> list[dict]:
    """Watchlist snapshot. Each quote is independently cached; fan out in parallel."""
    seen: list[str] = []
    for s in symbols:
        u = s.strip().upper()
        if u and u not in seen:
            seen.append(u)

    def one(sym: str) -> dict:
        try:
            return get_quote(sym)
        except SymbolNotFound:
            return {"symbol": sym, "error": "not_found"}
        except UpstreamError as exc:
            return {"symbol": sym, "error": f"upstream: {exc}"}

    if not seen:
        return []
    with ThreadPoolExecutor(max_workers=min(8, len(seen))) as pool:
        return list(pool.map(one, seen))


def get_score(symbol: str, w_fundamental: float = 0.5, w_technical: float = 0.3,
              w_sentiment: float = 0.2) -> dict:
    """Composite score. Reuses cached `.info` + one cached 1y history; the only
    extra fetch is the recommendations table (inside get_analysis)."""
    from app.services import scoring

    _info(symbol)  # validates symbol (404) and warms info cache
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_fund = pool.submit(get_fundamentals, symbol)
        f_tech = pool.submit(compute_technicals, symbol)
        f_analysis = pool.submit(get_analysis, symbol)
        fund, tech, analysis = f_fund.result(), f_tech.result(), f_analysis.result()
    weights = {
        "w_fundamental": w_fundamental,
        "w_technical": w_technical,
        "w_sentiment": w_sentiment,
    }
    return scoring.build_report(symbol, fund, tech, analysis, weights)

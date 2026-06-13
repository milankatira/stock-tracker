"""Stock research endpoints.

REST shape mirrors how an analyst actually drills in:
snapshot -> profile -> fundamentals -> statements -> history -> analyst view ->
news, plus a single `/research` rollup. Every route returns a typed model so
the OpenAPI/Swagger schema is self-documenting.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app import schemas
from app.services import market_data as md

router = APIRouter(prefix="/v1/stocks", tags=["stocks"])

SYMBOL_RESPONSES = {
    404: {"model": schemas.ErrorResponse, "description": "Symbol not found."},
    502: {"model": schemas.ErrorResponse, "description": "Upstream data error."},
}


def normalize_symbol(
    symbol: Annotated[str, Path(description="Ticker symbol, e.g. AAPL.", examples=["AAPL"])],
) -> str:
    cleaned = symbol.strip().upper()
    if not cleaned or len(cleaned) > 20:
        raise HTTPException(status_code=422, detail="Invalid ticker symbol.")
    return cleaned


Symbol = Annotated[str, Depends(normalize_symbol)]


def _call(fn, *args):
    """Translate service-layer exceptions into HTTP responses."""
    try:
        return fn(*args)
    except md.SymbolNotFound as exc:
        raise HTTPException(status_code=404, detail=f"Symbol not found: {exc}") from exc
    except md.UpstreamError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream data error: {exc}") from exc


@router.get("/{symbol}/quote", response_model=schemas.Quote, responses=SYMBOL_RESPONSES,
            summary="Live price snapshot")
def quote(symbol: Symbol) -> dict:
    return _call(md.get_quote, symbol)


@router.get("/{symbol}/profile", response_model=schemas.CompanyProfile,
            responses=SYMBOL_RESPONSES, summary="Company profile")
def profile(symbol: Symbol) -> dict:
    return _call(md.get_profile, symbol)


@router.get("/{symbol}/fundamentals", response_model=schemas.Fundamentals,
            responses=SYMBOL_RESPONSES, summary="Valuation, profitability & growth ratios")
def fundamentals(symbol: Symbol) -> dict:
    return _call(md.get_fundamentals, symbol)


@router.get("/{symbol}/analysis", response_model=schemas.AnalystView,
            responses=SYMBOL_RESPONSES, summary="Analyst targets & recommendation trend")
def analysis(symbol: Symbol) -> dict:
    return _call(md.get_analysis, symbol)


@router.get("/{symbol}/history", response_model=schemas.HistoryResponse,
            responses=SYMBOL_RESPONSES, summary="OHLCV price history")
def history(
    symbol: Symbol,
    period: Annotated[
        Literal["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"],
        Query(description="Look-back window."),
    ] = "1mo",
    interval: Annotated[
        Literal["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"],
        Query(description="Bar size."),
    ] = "1d",
) -> dict:
    return _call(md.get_history, symbol, period, interval)


@router.get("/{symbol}/financials", response_model=schemas.FinancialStatement,
            responses=SYMBOL_RESPONSES, summary="Income / balance / cashflow statement")
def financials(
    symbol: Symbol,
    statement: Annotated[
        Literal["income", "balance", "cashflow"],
        Query(description="Which statement to return."),
    ] = "income",
    freq: Annotated[
        Literal["annual", "quarterly"], Query(description="Reporting frequency.")
    ] = "annual",
) -> dict:
    return _call(md.get_financials, symbol, statement, freq)


@router.get("/{symbol}/news", response_model=list[schemas.NewsItem],
            responses=SYMBOL_RESPONSES, summary="Recent news")
def news(
    symbol: Symbol,
    limit: Annotated[int, Query(ge=1, le=50, description="Max items.")] = 10,
) -> list[dict]:
    return _call(md.get_news, symbol, limit)


@router.get("/quotes", response_model=list[schemas.Quote],
            summary="Batch quotes (watchlist)")
def batch_quotes(
    symbols: Annotated[str, Query(description="Comma-separated tickers, e.g. AAPL,MSFT,NVDA.",
                                  examples=["AAPL,MSFT,NVDA"])],
) -> list[dict]:
    requested = [s for s in symbols.split(",") if s.strip()]
    if not requested:
        raise HTTPException(status_code=422, detail="Provide at least one symbol.")
    if len(requested) > 50:
        raise HTTPException(status_code=422, detail="Max 50 symbols per request.")
    return md.get_batch_quotes(requested)


@router.get("/{symbol}/technicals", response_model=schemas.TechnicalIndicators,
            responses=SYMBOL_RESPONSES, summary="Technical indicators (SMA/EMA/RSI/52w)")
def technicals(symbol: Symbol) -> dict:
    return _call(md.compute_technicals, symbol)


@router.get("/{symbol}/returns", response_model=schemas.ReturnsBlock,
            responses=SYMBOL_RESPONSES, summary="Trailing returns (1d..1y, YTD)")
def returns(symbol: Symbol) -> dict:
    return _call(md.compute_returns, symbol)


@router.get("/{symbol}/earnings", response_model=schemas.Earnings,
            responses=SYMBOL_RESPONSES, summary="Earnings dates, estimates & revisions")
def earnings(symbol: Symbol) -> dict:
    return _call(md.get_earnings, symbol)


@router.get("/{symbol}/holders", response_model=schemas.Holders,
            responses=SYMBOL_RESPONSES, summary="Institutional & insider ownership")
def holders(symbol: Symbol) -> dict:
    return _call(md.get_holders, symbol)


@router.get("/{symbol}/dividends", response_model=schemas.Dividends,
            responses=SYMBOL_RESPONSES, summary="Dividend & split history")
def dividends(symbol: Symbol) -> dict:
    return _call(md.get_dividends, symbol)


@router.get("/{symbol}/score", response_model=schemas.ScoreReport,
            responses=SYMBOL_RESPONSES, summary="Composite score & buy-setup verdict")
def score(
    symbol: Symbol,
    w_fundamental: Annotated[float, Query(ge=0, le=1)] = 0.5,
    w_technical: Annotated[float, Query(ge=0, le=1)] = 0.3,
    w_sentiment: Annotated[float, Query(ge=0, le=1)] = 0.2,
) -> dict:
    return _call(md.get_score, symbol, w_fundamental, w_technical, w_sentiment)


@router.get("/{symbol}/research", response_model=schemas.ResearchReport,
            responses=SYMBOL_RESPONSES, summary="Consolidated research report")
def research(symbol: Symbol) -> dict:
    return _call(md.get_research, symbol)

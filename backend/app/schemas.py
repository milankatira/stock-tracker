"""Response contracts.

Typed Pydantic models for the analyst-relevant subset of fields. These drive
the auto-generated OpenAPI/Swagger schema — every field carries a description
so `/docs` reads like documentation. We deliberately do NOT model all 184
`.info` keys; raw financial statements stay flexible (period -> line items).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field("ok", description="Service liveness flag.")
    version: str = Field(..., description="API version.")


class Quote(BaseModel):
    """Live price snapshot — the cheap, high-frequency endpoint."""

    symbol: str
    currency: str | None = None
    exchange: str | None = None
    last_price: float | None = Field(None, description="Most recent traded price.")
    previous_close: float | None = None
    change: float | None = Field(None, description="last_price - previous_close.")
    change_percent: float | None = Field(None, description="Percent change vs previous close.")
    day_high: float | None = None
    day_low: float | None = None
    open: float | None = None
    year_high: float | None = Field(None, description="52-week high.")
    year_low: float | None = Field(None, description="52-week low.")
    fifty_day_average: float | None = None
    two_hundred_day_average: float | None = None
    volume: float | None = None
    market_cap: float | None = None
    error: str | None = Field(None, description="Set on batch entries that failed (e.g. 'not_found').")


class CompanyProfile(BaseModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    country: str | None = None
    website: str | None = None
    employees: int | None = Field(None, description="Full-time employees.")
    summary: str | None = Field(None, description="Business description.")


class Valuation(BaseModel):
    market_cap: float | None = None
    enterprise_value: float | None = None
    trailing_pe: float | None = Field(None, description="Trailing P/E.")
    forward_pe: float | None = Field(None, description="Forward P/E.")
    price_to_book: float | None = None
    price_to_sales: float | None = Field(None, description="Trailing price/sales.")
    peg_ratio: float | None = None


class Profitability(BaseModel):
    profit_margin: float | None = None
    operating_margin: float | None = None
    gross_margin: float | None = None
    return_on_equity: float | None = None
    return_on_assets: float | None = None
    trailing_eps: float | None = None


class Growth(BaseModel):
    revenue_growth: float | None = Field(None, description="YoY revenue growth.")
    earnings_growth: float | None = Field(None, description="YoY earnings growth.")


class FinancialHealth(BaseModel):
    total_cash: float | None = None
    total_debt: float | None = None
    debt_to_equity: float | None = None
    current_ratio: float | None = None
    free_cashflow: float | None = None


class Dividend(BaseModel):
    dividend_yield: float | None = None
    dividend_rate: float | None = None
    payout_ratio: float | None = None


class Fundamentals(BaseModel):
    """Valuation, quality and growth ratios — the screening surface."""

    symbol: str
    beta: float | None = Field(None, description="Volatility vs market.")
    valuation: Valuation
    profitability: Profitability
    growth: Growth
    financial_health: FinancialHealth
    dividend: Dividend


class PriceTargets(BaseModel):
    current: float | None = None
    low: float | None = None
    high: float | None = None
    mean: float | None = None
    median: float | None = None
    upside_percent: float | None = Field(
        None, description="(mean - current) / current, in percent."
    )


class RecommendationTrend(BaseModel):
    period: str = Field(..., description="Relative month, e.g. '0m', '-1m'.")
    strong_buy: int = 0
    buy: int = 0
    hold: int = 0
    sell: int = 0
    strong_sell: int = 0


class AnalystView(BaseModel):
    symbol: str
    recommendation: str | None = Field(None, description="Consensus key, e.g. 'buy'.")
    number_of_analysts: int | None = None
    price_targets: PriceTargets
    trend: list[RecommendationTrend] = Field(
        default_factory=list, description="Recommendation counts over recent months."
    )


class HistoryBar(BaseModel):
    date: str = Field(..., description="ISO 8601 timestamp.")
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: float | None = None


class HistoryResponse(BaseModel):
    symbol: str
    period: str
    interval: str
    bars: list[HistoryBar]


class FinancialStatement(BaseModel):
    symbol: str
    statement: str = Field(..., description="income | balance | cashflow.")
    frequency: str = Field(..., description="annual | quarterly.")
    periods: list[dict] = Field(
        ..., description="One object per reporting period: {date, line items...}."
    )


class NewsItem(BaseModel):
    title: str | None = None
    publisher: str | None = None
    published_at: str | None = None
    summary: str | None = None
    url: str | None = None


class ResearchReport(BaseModel):
    """One-shot consolidated analyst view, composed server-side."""

    symbol: str
    quote: Quote
    profile: CompanyProfile
    fundamentals: Fundamentals
    analysis: AnalystView
    news: list[NewsItem]


class TechnicalIndicators(BaseModel):
    symbol: str
    last_price: float | None = None
    sma_50: float | None = None
    sma_200: float | None = None
    ema_20: float | None = None
    rsi_14: float | None = Field(None, description="Wilder RSI(14). <30 oversold, >70 overbought.")
    above_sma_50: bool | None = None
    above_sma_200: bool | None = None
    ma_cross: str | None = Field(None, description="'golden' (SMA50>SMA200) or 'death'.")
    position_52w: float | None = Field(None, description="0=at 52w low, 100=at 52w high.")
    annualized_volatility: float | None = Field(None, description="Annualized stdev of daily returns.")
    data_points: int = Field(..., description="Daily closes used.")


class ReturnsBlock(BaseModel):
    symbol: str
    field_1d: float | None = Field(None, alias="1d")
    field_1w: float | None = Field(None, alias="1w")
    field_1mo: float | None = Field(None, alias="1mo")
    field_3mo: float | None = Field(None, alias="3mo")
    field_6mo: float | None = Field(None, alias="6mo")
    field_1y: float | None = Field(None, alias="1y")
    ytd: float | None = None

    model_config = {"populate_by_name": True}


class Earnings(BaseModel):
    symbol: str
    upcoming: list[dict] = Field(..., description="Recent/next earnings dates with EPS estimate, reported, surprise%.")
    estimates: list[dict] = Field(..., description="Analyst EPS estimates by period (0q/+1q/0y/+1y).")
    eps_trend: list[dict] = Field(..., description="EPS estimate drift over the last 90 days.")
    eps_revisions: list[dict] = Field(..., description="Up/down revisions in last 7/30 days.")
    growth_estimates: list[dict] = Field(..., description="Expected growth vs index.")


class Holders(BaseModel):
    symbol: str
    summary: dict = Field(..., description="Insider %, institutional %, holder counts.")
    institutional: list[dict] = Field(..., description="Top institutional holders.")
    insider_transactions: list[dict] = Field(..., description="Recent insider buys/sells.")


class Dividends(BaseModel):
    symbol: str
    dividends: list[dict] = Field(..., description="Dividend history (date, amount).")
    splits: list[dict] = Field(..., description="Split history (date, ratio).")


# --- scoring ---------------------------------------------------------------
class ScoreComponent(BaseModel):
    metric: str = Field(..., description="Input name.")
    value: float | None = Field(None, description="Raw value.")
    score: float | None = Field(None, description="Normalized 0-100 sub-score (None if unavailable).")


class PillarScore(BaseModel):
    name: str
    score: float | None = Field(None, description="Pillar score 0-100, or None if no inputs.")
    coverage: float = Field(..., description="Fraction of inputs available (0-1).")
    components: list[ScoreComponent]


class DimensionScore(BaseModel):
    score: float | None = Field(None, description="Dimension score 0-100.")
    coverage: float = Field(..., description="Fraction of inputs available (0-1).")
    pillars: list[PillarScore] = Field(default_factory=list)
    components: list[ScoreComponent] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class TimingSignal(BaseModel):
    setup: str = Field(..., description="Descriptive setup label, e.g. 'oversold pullback, undervalued'.")
    factors: list[str] = Field(..., description="Observed conditions supporting the setup.")


class ScoreReport(BaseModel):
    symbol: str
    fundamental: DimensionScore
    technical: DimensionScore
    sentiment: DimensionScore
    composite: float | None = Field(None, description="Weighted blend 0-100.")
    verdict: str = Field(..., description="Strong Buy / Buy / Hold / Reduce / Avoid / Insufficient data.")
    timing: TimingSignal
    weights: dict = Field(..., description="Dimension weights used.")
    coverage: float = Field(..., description="Overall input coverage (0-1).")
    methodology: str = Field(..., description="How scores are computed and their limitations.")
    disclaimer: str


class ErrorResponse(BaseModel):
    detail: str


# --- Watchlist ------------------------------------------------------------


class WatchlistAdd(BaseModel):
    """Request body to add (or re-add) a symbol to the watchlist."""

    symbol: str = Field(..., description="Ticker symbol, e.g. AAPL.", examples=["AAPL"])
    note: str | None = Field(
        None, max_length=500, description="Optional free-text note, e.g. 'oversold, watching for entry'."
    )


class WatchlistItem(BaseModel):
    """A persisted watchlist entry."""

    symbol: str = Field(..., description="Normalized ticker symbol.")
    note: str | None = Field(None, description="Optional free-text note.")
    added_at: datetime = Field(..., description="UTC timestamp the symbol was first added.")


class WatchlistQuote(Quote):
    """A watchlist entry enriched with its live quote and note."""

    note: str | None = Field(None, description="Optional free-text note carried from the watchlist.")

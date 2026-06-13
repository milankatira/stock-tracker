# Stock Research API

Cached, analyst-oriented REST API over Yahoo Finance (`yfinance`), built with FastAPI.
Auto-generated Swagger docs, typed responses, JSON-safe serialization.

> Research/education only — **not investment advice**.

## Design

A pro analyst drills from snapshot → fundamentals → statements → analyst view → news.
The API mirrors that, and is **optimized so each endpoint reuses one cached upstream
fetch** instead of re-scraping:

- `/quote` uses the cheap `fast_info` path (short TTL — live price).
- `/profile`, `/fundamentals`, `/analysis` all project from a **single** cached `.info`
  scrape (long TTL — effectively static intraday).
- `/research` composes the full report, fanning out the remaining calls in parallel.
- All `NaN` / `NaT` / `Inf` from pandas are mapped to JSON `null`.
- Unknown tickers return **404** (Yahoo returns sparse data, not an error).

| Layer | File |
|-------|------|
| App + Swagger metadata | `app/main.py` |
| Routes | `app/routers/stocks.py` |
| Response contracts | `app/schemas.py` |
| yfinance wrapper + normalization | `app/services/market_data.py` |
| TTL cache | `app/cache.py` |
| Config (env-driven TTLs) | `app/config.py` |

## Run

```bash
make install         # installs deps + dev + ui into the uv venv
make dev             # backend:  uvicorn app.main:app --reload  (http://127.0.0.1:8000)
make ui              # frontend: streamlit run frontend/app.py   (http://localhost:8501)
make test            # pytest
make lint            # ruff
```

Start the backend first (`make dev`), then the UI (`make ui`) in a second shell.

## Frontend — Streamlit research terminal

A data-dense, single-page research terminal (Python/Streamlit + Plotly) that
talks to this API. Chosen over Next.js: same Python stack, one command, native
charts/tables — right tool for a local single-user research dashboard.

- **Header**: company, live price, **verdict badge** + composite score (the lead).
- **Tabs**: Overview · Score · Chart · Fundamentals · Analysts & Earnings ·
  Ownership · News · Watchlist.
- **Score tab** renders the gauge, dimension bars, timing setup, full component
  breakdown — and surfaces the backend's `methodology`, limitation and disclaimer.
- **Chart**: candlestick + SMA50/200 overlay + volume + RSI(14); defaults to 2y
  so SMA200 actually renders.
- **Watchlist**: batch table that surfaces per-symbol `error` (no silent nulls).
- Backend URL is configurable in the sidebar (`STOCK_API_URL` env override). If
  the backend is down, the UI shows one loud error and stops.

```bash
STOCK_API_URL=http://127.0.0.1:8000 make ui
```

Layout: `frontend/api.py` (cached client) · `frontend/components.py` (Plotly
builders) · `frontend/theme.py` (verdict colors/formatting) · `frontend/app.py`.

## Swagger / OpenAPI

Generated automatically by FastAPI — no manual spec:

- Swagger UI: <http://127.0.0.1:8000/docs>
- ReDoc:      <http://127.0.0.1:8000/redoc>
- Raw schema: <http://127.0.0.1:8000/openapi.json>

`GET /` redirects to `/docs`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| GET | `/v1/stocks/quotes?symbols=AAPL,MSFT,NVDA` | **Batch** quotes (watchlist, ≤50) |
| GET | `/v1/stocks/{symbol}/quote` | Live price snapshot |
| GET | `/v1/stocks/{symbol}/profile` | Company profile |
| GET | `/v1/stocks/{symbol}/fundamentals` | Valuation / profitability / growth ratios |
| GET | `/v1/stocks/{symbol}/financials?statement=income\|balance\|cashflow&freq=annual\|quarterly` | Statements |
| GET | `/v1/stocks/{symbol}/history?period=1mo&interval=1d` | OHLCV history |
| GET | `/v1/stocks/{symbol}/technicals` | SMA50/200, EMA, RSI, MA-cross, 52w position, volatility |
| GET | `/v1/stocks/{symbol}/returns` | Trailing returns 1d…1y + YTD |
| GET | `/v1/stocks/{symbol}/analysis` | Analyst targets + recommendation trend |
| GET | `/v1/stocks/{symbol}/earnings` | Earnings dates, EPS estimates, revisions |
| GET | `/v1/stocks/{symbol}/holders` | Institutional & insider ownership |
| GET | `/v1/stocks/{symbol}/dividends` | Dividend & split history |
| GET | `/v1/stocks/{symbol}/news?limit=10` | Recent headlines |
| GET | `/v1/stocks/{symbol}/score?w_fundamental=0.5&w_technical=0.3&w_sentiment=0.2` | **Composite score + buy-setup verdict** |
| GET | `/v1/stocks/{symbol}/research` | Consolidated report (all of the above) |

## Scoring engine (`/score`)

Deterministic, explainable 0–100 scores — every number ships with its component
breakdown, coverage %, methodology and a disclaimer.

- **Fundamental** = mean of Valuation / Quality / Growth / Health pillars.
  Negative or missing multiples (P/E, PEG, P/B, P/S) are **excluded**, never
  scored as "cheap".
- **Technical** = trend vs SMA50/200, golden/death cross, RSI(14), 52-week
  position (overbought/extended penalized).
- **Sentiment** = analyst consensus + recommendation-trend ratio + target upside.
  **News headlines are not scored** (too noisy to calibrate).
- **Composite** = coverage-renormalized weighted blend → verdict
  (`Strong Buy` … `Avoid`). Below 50 % coverage → `Insufficient data`.
- **Timing** = a *descriptive* setup ("constructive entry setup — quality with a
  valuation/technical pullback"), not a directive. Not investment advice.

> **Limitation (stated, not hidden):** valuation bands are absolute, not
> sector-relative — compare scores within a peer group, not across sectors.

## Test with curl

```bash
BASE=http://127.0.0.1:8000

# Liveness
curl -s $BASE/health

# Live quote
curl -s "$BASE/v1/stocks/AAPL/quote"

# Company profile
curl -s "$BASE/v1/stocks/AAPL/profile"

# Fundamentals (valuation, margins, growth, health, dividend)
curl -s "$BASE/v1/stocks/MSFT/fundamentals"

# Annual income statement (also: balance | cashflow, freq=quarterly)
curl -s "$BASE/v1/stocks/AAPL/financials?statement=income&freq=annual"

# Price history — 6 months of daily bars
curl -s "$BASE/v1/stocks/AAPL/history?period=6mo&interval=1d"

# Analyst price targets + recommendation trend
curl -s "$BASE/v1/stocks/NVDA/analysis"

# Recent news (max 50)
curl -s "$BASE/v1/stocks/AAPL/news?limit=5"

# Batch watchlist quotes
curl -s "$BASE/v1/stocks/quotes?symbols=AAPL,MSFT,NVDA"

# Technical indicators (SMA/EMA/RSI/52w/vol)
curl -s "$BASE/v1/stocks/AAPL/technicals"

# Trailing returns (1d..1y, YTD)
curl -s "$BASE/v1/stocks/AAPL/returns"

# Earnings dates, estimates, revisions
curl -s "$BASE/v1/stocks/AAPL/earnings"

# Ownership — institutional + insider
curl -s "$BASE/v1/stocks/AAPL/holders"

# Dividend & split history
curl -s "$BASE/v1/stocks/AAPL/dividends"

# Composite score + buy-setup verdict (default weights)
curl -s "$BASE/v1/stocks/AAPL/score"

# Score with custom weights (e.g. pure fundamental)
curl -s "$BASE/v1/stocks/AAPL/score?w_fundamental=1&w_technical=0&w_sentiment=0"

# One-shot consolidated research report
curl -s "$BASE/v1/stocks/AAPL/research"

# 404 on unknown symbol
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/v1/stocks/ZZZZNOPE/profile"
```

Pretty-print with `| python -m json.tool` or `| jq`.

## Configuration (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `QUOTE_TTL` | `30` | Live quote cache (s) |
| `INFO_TTL` | `3600` | Profile/fundamentals cache (s) |
| `SLOW_TTL` | `1800` | History/statements/analysis cache (s) |
| `NEWS_TTL` | `600` | News cache (s) |
| `CORS_ORIGINS` | `*` | Comma-separated allow-list |

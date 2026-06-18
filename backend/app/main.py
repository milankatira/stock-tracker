"""FastAPI application.

Swagger/OpenAPI is generated automatically by FastAPI from the typed routes and
response models — served at /docs (Swagger UI), /redoc (ReDoc), and
/openapi.json (raw schema). The metadata below is what makes those docs read
like real documentation.
"""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import RedirectResponse

from app import __version__, config, schemas
from app.routers import stocks, watchlist

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("stock_api")

DESCRIPTION = """
Stock research REST API — a thin, cached, analyst-oriented wrapper over Yahoo
Finance data.

* **/quote** — live price snapshot (cheap, short cache)
* **/profile** — company profile
* **/fundamentals** — valuation, profitability & growth ratios
* **/financials** — income / balance / cashflow statements
* **/history** — OHLCV price history
* **/analysis** — analyst price targets & recommendation trend
* **/news** — recent headlines
* **/research** — everything above in one consolidated report
* **/watchlist** — save symbols (MongoDB) and pull live quotes for them

Data is sourced from Yahoo Finance via `yfinance` and is for research/education
only — not investment advice.
""".strip()

app = FastAPI(
    title="Stock Research API",
    description=DESCRIPTION,
    version=__version__,
    contact={"name": "tracker"},
    license_info={"name": "MIT"},
    openapi_tags=[
        {"name": "stocks", "description": "Per-symbol research endpoints."},
        {"name": "meta", "description": "Service metadata."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)
# Compress fat payloads (financials, history, research).
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Structured request timing — observability without leaking PII."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round(elapsed_ms, 1),
        },
    )
    return response


app.include_router(stocks.router)
app.include_router(watchlist.router)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/health", response_model=schemas.HealthResponse, tags=["meta"],
         summary="Liveness check")
def health() -> dict:
    return {"status": "ok", "version": __version__}

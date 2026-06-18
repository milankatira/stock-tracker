"""Watchlist endpoints.

Personal, single-user watchlist persisted in MongoDB:

* **POST /v1/watchlist** — add (or re-add) a symbol, optional note
* **GET  /v1/watchlist** — list saved entries (newest first)
* **GET  /v1/watchlist/quotes** — entries enriched with live quotes
* **DELETE /v1/watchlist/{symbol}** — remove a symbol

Storage failures map to 503 (service unavailable) without leaking internals.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app import schemas
from app.services import watchlist as wl

router = APIRouter(prefix="/v1/watchlist", tags=["watchlist"])

UNAVAILABLE = {
    503: {"model": schemas.ErrorResponse, "description": "Watchlist store unavailable."},
}


def _guard(fn, *args):
    """Translate service-layer exceptions into HTTP responses."""
    try:
        return fn(*args)
    except wl.InvalidSymbol as exc:
        raise HTTPException(status_code=422, detail=f"Invalid ticker symbol: {exc}") from exc
    except wl.WatchlistUnavailable as exc:
        raise HTTPException(
            status_code=503, detail=f"Watchlist store unavailable: {exc}"
        ) from exc


@router.post("", response_model=schemas.WatchlistItem, status_code=status.HTTP_201_CREATED,
             responses=UNAVAILABLE, summary="Add a symbol to the watchlist")
def add(body: schemas.WatchlistAdd) -> dict:
    return _guard(wl.add, body.symbol, body.note)


@router.get("", response_model=list[schemas.WatchlistItem], responses=UNAVAILABLE,
            summary="List watchlist entries")
def list_watchlist() -> list[dict]:
    return _guard(wl.list_items)


@router.get("/quotes", response_model=list[schemas.WatchlistQuote], responses=UNAVAILABLE,
            summary="Watchlist entries with live quotes")
def quotes() -> list[dict]:
    return _guard(wl.quotes)


@router.delete("/{symbol}", status_code=status.HTTP_204_NO_CONTENT,
               responses={**UNAVAILABLE,
                          404: {"model": schemas.ErrorResponse, "description": "Symbol not on watchlist."}},
               summary="Remove a symbol from the watchlist")
def remove(symbol: str) -> None:
    deleted = _guard(wl.remove, symbol)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Symbol not on watchlist: {symbol}")

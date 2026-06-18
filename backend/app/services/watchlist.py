"""Watchlist persistence service.

Thin layer over the MongoDB collection: validate/normalize symbols, upsert
(idempotent add, last-write-wins on `note`), list, and remove. Live quotes are
not stored — they are joined on read via `market_data.get_batch_quotes`, the
same batch path the `/v1/stocks/quotes` endpoint already uses.

Storage exceptions are normalized to `WatchlistUnavailable` so the router can
map any cluster problem to a clean 503 without leaking pymongo internals.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pymongo.errors import PyMongoError

from app import db
from app.services import market_data as md


class InvalidSymbol(ValueError):
    """Symbol failed normalization (empty or too long)."""


class WatchlistUnavailable(RuntimeError):
    """Backing store is unconfigured or unreachable."""


def normalize_symbol(symbol: str) -> str:
    cleaned = (symbol or "").strip().upper()
    if not cleaned or len(cleaned) > 20:
        raise InvalidSymbol(symbol)
    return cleaned


def _projected(doc: dict) -> dict:
    """Map a Mongo document to the public WatchlistItem shape (drop `_id`)."""
    return {"symbol": doc["symbol"], "note": doc.get("note"), "added_at": doc["added_at"]}


def add(symbol: str, note: str | None = None) -> dict:
    """Add or re-add a symbol. Idempotent: re-adding updates the note and
    preserves the original `added_at`."""
    sym = normalize_symbol(symbol)
    now = datetime.now(timezone.utc)
    try:
        coll = db.get_collection()
        coll.update_one(
            {"symbol": sym},
            {"$set": {"symbol": sym, "note": note}, "$setOnInsert": {"added_at": now}},
            upsert=True,
        )
        doc = coll.find_one({"symbol": sym})
    except db.DatabaseNotConfigured as exc:
        raise WatchlistUnavailable(str(exc)) from exc
    except PyMongoError as exc:
        raise WatchlistUnavailable(str(exc)) from exc
    return _projected(doc)


def list_items() -> list[dict]:
    """Return all watchlist entries, newest first."""
    try:
        coll = db.get_collection()
        docs = list(coll.find().sort("added_at", -1))
    except db.DatabaseNotConfigured as exc:
        raise WatchlistUnavailable(str(exc)) from exc
    except PyMongoError as exc:
        raise WatchlistUnavailable(str(exc)) from exc
    return [_projected(d) for d in docs]


def remove(symbol: str) -> bool:
    """Remove a symbol. Returns True if an entry was deleted."""
    sym = normalize_symbol(symbol)
    try:
        result = db.get_collection().delete_one({"symbol": sym})
    except db.DatabaseNotConfigured as exc:
        raise WatchlistUnavailable(str(exc)) from exc
    except PyMongoError as exc:
        raise WatchlistUnavailable(str(exc)) from exc
    return result.deleted_count > 0


def quotes() -> list[dict]:
    """Return watchlist entries enriched with live batch quotes.

    Each result is a quote dict with the entry's `note` merged in. Order
    follows the watchlist (newest first); symbols that fail upstream still
    appear with their `error` field set (batch quotes never raise per-symbol).
    """
    items = list_items()
    if not items:
        return []
    notes = {item["symbol"]: item["note"] for item in items}
    batch = md.get_batch_quotes(list(notes))
    by_symbol = {q["symbol"]: q for q in batch}
    enriched: list[dict] = []
    for symbol, note in notes.items():
        quote = by_symbol.get(symbol, {"symbol": symbol, "error": "not_found"})
        enriched.append({**quote, "note": note})
    return enriched

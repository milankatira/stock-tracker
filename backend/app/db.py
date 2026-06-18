"""MongoDB access for watchlist persistence.

The client is created lazily on first use (not at import) so the app boots —
and the test suite runs — without a live cluster or a configured `MONGODB_URI`.
This mirrors the `market_data._ticker` seam: tests monkeypatch `get_collection`
to return an in-memory mongomock collection, so unit tests never touch network.
"""

from __future__ import annotations

import threading

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection

from app import config

_client: MongoClient | None = None
_lock = threading.Lock()


class DatabaseNotConfigured(RuntimeError):
    """Raised when a watchlist op runs but `MONGODB_URI` is unset."""


def _get_client() -> MongoClient:
    """Lazily build a process-wide client (thread-safe, single-flight)."""
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is None:
            if not config.MONGODB_URI:
                raise DatabaseNotConfigured("MONGODB_URI is not set")
            _client = MongoClient(
                config.MONGODB_URI,
                serverSelectionTimeoutMS=config.MONGODB_TIMEOUT_MS,
                tz_aware=True,
            )
    return _client


def get_collection() -> Collection:
    """Return the watchlist collection, ensuring its unique index exists.

    A unique index on `symbol` makes adds idempotent (last-write-wins via
    upsert) and prevents duplicate entries.
    """
    coll = _get_client()[config.MONGODB_DB][config.WATCHLIST_COLLECTION]
    coll.create_index([("symbol", ASCENDING)], unique=True)
    return coll

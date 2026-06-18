"""Watchlist endpoint + service tests.

The Mongo boundary is mocked via the `mongo_watchlist` fixture (mongomock), so
these run offline. Live quotes use the existing `fake_upstream` fixture.
"""

from __future__ import annotations

import pytest
from pymongo.errors import ServerSelectionTimeoutError

from app import db
from app.services import watchlist as wl


def test_add_then_list(client, mongo_watchlist):
    resp = client.post("/v1/watchlist", json={"symbol": "aapl", "note": "watching"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["symbol"] == "AAPL"  # normalized
    assert body["note"] == "watching"
    assert body["added_at"]

    listed = client.get("/v1/watchlist").json()
    assert [i["symbol"] for i in listed] == ["AAPL"]


def test_add_is_idempotent_and_updates_note(client, mongo_watchlist):
    client.post("/v1/watchlist", json={"symbol": "MSFT", "note": "first"})
    first = mongo_watchlist.find_one({"symbol": "MSFT"})["added_at"]

    resp = client.post("/v1/watchlist", json={"symbol": "MSFT", "note": "second"})
    assert resp.status_code == 201
    assert resp.json()["note"] == "second"  # note overwritten

    docs = list(mongo_watchlist.find({"symbol": "MSFT"}))
    assert len(docs) == 1  # no duplicate
    assert docs[0]["added_at"] == first  # original timestamp preserved


def test_list_is_newest_first(client, mongo_watchlist):
    for sym in ("AAPL", "MSFT", "NVDA"):
        client.post("/v1/watchlist", json={"symbol": sym})
    symbols = [i["symbol"] for i in client.get("/v1/watchlist").json()]
    assert symbols == ["NVDA", "MSFT", "AAPL"]


def test_remove(client, mongo_watchlist):
    client.post("/v1/watchlist", json={"symbol": "AAPL"})
    assert client.delete("/v1/watchlist/aapl").status_code == 204
    assert client.get("/v1/watchlist").json() == []


def test_remove_missing_is_404(client, mongo_watchlist):
    resp = client.delete("/v1/watchlist/AAPL")
    assert resp.status_code == 404


def test_invalid_symbol_is_422(client, mongo_watchlist):
    resp = client.post("/v1/watchlist", json={"symbol": "   "})
    assert resp.status_code == 422


def test_quotes_enriches_with_note(client, mongo_watchlist, fake_upstream):
    client.post("/v1/watchlist", json={"symbol": "AAPL", "note": "core holding"})
    resp = client.get("/v1/watchlist/quotes")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["symbol"] == "AAPL"
    assert rows[0]["note"] == "core holding"
    assert rows[0]["last_price"] == pytest.approx(291.13)


def test_quotes_empty_watchlist(client, mongo_watchlist):
    assert client.get("/v1/watchlist/quotes").json() == []


def test_store_unavailable_is_503(client, monkeypatch):
    def boom():
        raise ServerSelectionTimeoutError("no cluster")

    monkeypatch.setattr(db, "get_collection", boom)
    resp = client.get("/v1/watchlist")
    assert resp.status_code == 503
    assert "unavailable" in resp.json()["detail"].lower()


def test_unconfigured_db_is_503(client, monkeypatch):
    def not_configured():
        raise db.DatabaseNotConfigured("MONGODB_URI is not set")

    monkeypatch.setattr(db, "get_collection", not_configured)
    resp = client.post("/v1/watchlist", json={"symbol": "AAPL"})
    assert resp.status_code == 503


def test_service_normalize_rejects_long_symbol():
    with pytest.raises(wl.InvalidSymbol):
        wl.normalize_symbol("X" * 21)

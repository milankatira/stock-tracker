"""Unit tests for the frontend API client — the one meaningfully testable layer.

Streamlit widget rendering is verified by booting headless (see README), not here.
"""

from __future__ import annotations

import pytest
import requests

from frontend import api


class FakeResp:
    def __init__(self, status=200, payload=None, raises_json=False, content=b"{}"):
        self.status_code = status
        self.ok = status < 400
        self._payload = payload
        self._raises_json = raises_json
        self.content = content

    def json(self):
        if self._raises_json:
            raise ValueError("no json")
        return self._payload


def _patch_get(monkeypatch, resp=None, exc=None):
    def fake_get(url, params=None, timeout=None):
        if exc:
            raise exc
        return resp
    monkeypatch.setattr(requests, "get", fake_get)


def test_returns_plain_dict_not_response(monkeypatch):
    _patch_get(monkeypatch, FakeResp(200, {"symbol": "AAPL", "last_price": 1.0}))
    out = api.quote("http://x", "AAPL")
    assert isinstance(out, dict)
    assert out["symbol"] == "AAPL"


def test_404_maps_to_friendly_error(monkeypatch):
    _patch_get(monkeypatch, FakeResp(404))
    with pytest.raises(api.ApiError, match="not found"):
        api.profile("http://x", "ZZZZ")


def test_422_maps_to_invalid_request(monkeypatch):
    _patch_get(monkeypatch, FakeResp(422))
    with pytest.raises(api.ApiError, match="Invalid"):
        api.quote("http://x", "!!")


def test_500_maps_to_backend_error(monkeypatch):
    _patch_get(monkeypatch, FakeResp(502))
    with pytest.raises(api.ApiError, match="Backend error"):
        api.score("http://x", "AAPL")


def test_connection_error_is_friendly_and_names_url(monkeypatch):
    _patch_get(monkeypatch, exc=requests.exceptions.ConnectionError())
    with pytest.raises(api.ApiError, match="unreachable"):
        api.health("http://127.0.0.1:8000")


def test_timeout_maps_to_friendly_error(monkeypatch):
    _patch_get(monkeypatch, exc=requests.exceptions.Timeout())
    with pytest.raises(api.ApiError, match="timed out"):
        api.quote("http://x", "AAPL")


def test_non_json_body_maps_to_error(monkeypatch):
    _patch_get(monkeypatch, FakeResp(200, raises_json=True))
    with pytest.raises(api.ApiError, match="non-JSON"):
        api.quote("http://x", "AAPL")


def test_batch_quotes_joins_symbols(monkeypatch):
    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["params"] = params
        return FakeResp(200, [{"symbol": "AAPL"}, {"symbol": "MSFT"}])

    monkeypatch.setattr(requests, "get", fake_get)
    out = api.batch_quotes("http://x", ["AAPL", "MSFT"])
    assert captured["params"]["symbols"] == "AAPL,MSFT"
    assert isinstance(out, list) and len(out) == 2


# --- watchlist ---------------------------------------------------------------
def _patch_request(monkeypatch, resp=None, exc=None, captured=None):
    def fake_request(method, url, json=None, timeout=None):
        if captured is not None:
            captured.update(method=method, url=url, json=json)
        if exc:
            raise exc
        return resp
    monkeypatch.setattr(requests, "request", fake_request)


def test_watchlist_add_posts_symbol_and_note(monkeypatch):
    captured: dict = {}
    _patch_request(monkeypatch, FakeResp(201, {"symbol": "AAPL", "note": "buy dip"}),
                   captured=captured)
    out = api.watchlist_add("http://x", "AAPL", "buy dip")
    assert captured["method"] == "POST"
    assert captured["url"].endswith("/v1/watchlist")
    assert captured["json"] == {"symbol": "AAPL", "note": "buy dip"}
    assert out["symbol"] == "AAPL"


def test_watchlist_add_blank_note_sent_as_null(monkeypatch):
    captured: dict = {}
    _patch_request(monkeypatch, FakeResp(201, {"symbol": "AAPL"}), captured=captured)
    api.watchlist_add("http://x", "AAPL", "")
    assert captured["json"]["note"] is None


def test_watchlist_remove_204_returns_none(monkeypatch):
    captured: dict = {}
    _patch_request(monkeypatch, FakeResp(204, content=b""), captured=captured)
    assert api.watchlist_remove("http://x", "AAPL") is None
    assert captured["method"] == "DELETE"
    assert captured["url"].endswith("/v1/watchlist/AAPL")


def test_watchlist_503_maps_to_unavailable(monkeypatch):
    _patch_request(monkeypatch, FakeResp(503))
    with pytest.raises(api.ApiError, match="unavailable"):
        api.watchlist_add("http://x", "AAPL")


def test_watchlist_quotes_uses_get(monkeypatch):
    _patch_get(monkeypatch, FakeResp(200, [{"symbol": "AAPL", "note": "x"}]))
    out = api.watchlist_quotes("http://x")
    assert isinstance(out, list) and out[0]["note"] == "x"

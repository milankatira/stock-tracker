"""Endpoint behavior tests (mocked upstream, no network)."""

from __future__ import annotations

import json

import pytest


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_root_redirects_to_docs(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"] == "/docs"


def test_quote(client, fake_upstream):
    r = client.get("/v1/stocks/aapl/quote")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "AAPL"  # normalized to upper
    assert body["last_price"] == 291.13
    # change = 291.13 - 295.80
    assert body["change"] == pytest.approx(-4.67, abs=0.01)
    assert body["change_percent"] == pytest.approx(-1.579, abs=0.01)


def test_profile(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/profile")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Apple Inc."
    assert body["sector"] == "Technology"
    assert body["employees"] == 166000


def test_fundamentals_nested_groups(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/fundamentals")
    assert r.status_code == 200
    body = r.json()
    assert body["valuation"]["trailing_pe"] == 35.2
    assert body["profitability"]["return_on_equity"] == 1.41
    assert body["financial_health"]["free_cashflow"] == 101090746368


def test_analysis_computes_upside(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/analysis")
    assert r.status_code == 200
    body = r.json()
    assert body["recommendation"] == "buy"
    assert body["price_targets"]["mean"] == 312.71
    # upside = (312.71 - 291.13) / 291.13 * 100
    assert body["price_targets"]["upside_percent"] == pytest.approx(7.41, abs=0.05)
    assert body["trend"][0]["strong_buy"] == 7


def test_history_cleans_nan_bar(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/history?period=5d&interval=1d")
    assert r.status_code == 200
    bars = r.json()["bars"]
    assert len(bars) == 2
    assert bars[1]["high"] is None  # NaN -> null, valid JSON
    # raw body must contain literal null, never NaN
    assert "NaN" not in r.text


def test_financials_periods(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/financials?statement=income&freq=annual")
    assert r.status_code == 200
    body = r.json()
    assert body["statement"] == "income"
    assert body["periods"][0]["Total Revenue"] == 400000.0
    assert body["periods"][0]["Net Income"] is None


def test_news(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/news?limit=5")
    assert r.status_code == 200
    items = r.json()
    assert items[0]["title"] == "Apple ships new chip"
    assert items[0]["publisher"] == "Reuters"
    assert items[0]["url"] == "https://example.com/a"


def test_research_composes_everything(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/research")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "AAPL"
    assert body["quote"]["last_price"] == 291.13
    assert body["profile"]["name"] == "Apple Inc."
    assert body["fundamentals"]["beta"] == 1.086
    assert body["analysis"]["recommendation"] == "buy"
    assert len(body["news"]) == 1


def test_unknown_symbol_returns_404(client, empty_upstream):
    r = client.get("/v1/stocks/ZZZZ/profile")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


def test_quote_unknown_symbol_404(client, empty_upstream):
    r = client.get("/v1/stocks/ZZZZ/quote")
    assert r.status_code == 404


def test_invalid_symbol_rejected(client):
    r = client.get("/v1/stocks/" + "A" * 30 + "/quote")
    assert r.status_code == 422


def test_history_invalid_period_rejected(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/history?period=banana")
    assert r.status_code == 422


def test_openapi_schema_generated(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    schema = json.loads(r.text)
    assert schema["info"]["title"] == "Stock Research API"
    assert "/v1/stocks/{symbol}/research" in schema["paths"]

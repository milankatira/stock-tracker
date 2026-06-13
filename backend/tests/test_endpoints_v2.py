"""Endpoint tests for the v2 surface (batch, technicals, returns, earnings,
holders, dividends, score) — mocked upstream, no network."""

from __future__ import annotations


def test_batch_quotes(client, fake_upstream):
    r = client.get("/v1/stocks/quotes?symbols=aapl,aapl,msft")
    assert r.status_code == 200
    body = r.json()
    # dedup -> 2 symbols, normalized upper
    assert [q["symbol"] for q in body] == ["AAPL", "MSFT"]


def test_batch_requires_symbols(client):
    assert client.get("/v1/stocks/quotes?symbols=").status_code == 422


def test_batch_surfaces_per_symbol_error(client, monkeypatch):
    """A bad symbol in a batch must carry an `error`, not a silent all-null quote."""
    from app.services import market_data as md

    def fake_batch(symbols):
        return [{"symbol": "AAPL", "last_price": 1.0},
                {"symbol": "ZZZZ", "error": "not_found"}]

    monkeypatch.setattr(md, "get_batch_quotes", fake_batch)
    r = client.get("/v1/stocks/quotes?symbols=AAPL,ZZZZ")
    assert r.status_code == 200
    bad = next(q for q in r.json() if q["symbol"] == "ZZZZ")
    assert bad["error"] == "not_found"  # survives response_model


def test_technicals(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/technicals")
    assert r.status_code == 200
    body = r.json()
    assert body["data_points"] == 520
    assert body["sma_50"] is not None
    assert body["sma_200"] is not None
    assert body["above_sma_50"] is True          # uptrend
    assert body["ma_cross"] == "golden"
    assert "NaN" not in r.text


def test_returns(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/returns")
    assert r.status_code == 200
    body = r.json()
    assert body["1d"] is not None
    assert body["1y"] is not None


def test_earnings(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/earnings")
    assert r.status_code == 200
    body = r.json()
    assert len(body["upcoming"]) >= 1
    assert body["estimates"][0]["period"] == "0q"
    assert "NaN" not in r.text  # reported EPS NaN -> null


def test_holders(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/holders")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["institutionsPercent"] == 0.62
    assert body["institutional"][0]["Holder"] == "Vanguard"


def test_dividends(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/dividends")
    assert r.status_code == 200
    body = r.json()
    assert body["dividends"][-1]["amount"] == 0.27
    assert body["splits"][0]["ratio"] == 4.0


def test_score_full_report(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/score")
    assert r.status_code == 200
    body = r.json()
    assert body["composite"] is not None
    assert body["verdict"] in {"Strong Buy", "Buy", "Hold", "Reduce", "Avoid"}
    assert set(body["weights"].values()) == {0.5, 0.3, 0.2}
    assert body["fundamental"]["score"] is not None
    assert body["timing"]["setup"]
    assert "not investment advice" in body["disclaimer"].lower()
    assert "NaN" not in r.text


def test_score_custom_weights(client, fake_upstream):
    r = client.get("/v1/stocks/AAPL/score?w_fundamental=1&w_technical=0&w_sentiment=0")
    assert r.status_code == 200
    body = r.json()
    # pure-fundamental weighting -> composite == fundamental score
    assert body["composite"] == body["fundamental"]["score"]


def test_score_unknown_symbol_404(client, empty_upstream):
    assert client.get("/v1/stocks/ZZZZ/score").status_code == 404

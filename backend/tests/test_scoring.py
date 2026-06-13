"""Pure unit tests for the scoring engine — focus on the correctness landmines."""

from __future__ import annotations

from app.services import scoring


def _fund(**over):
    base = {
        "valuation": {"market_cap": 1e12, "forward_pe": 15, "peg_ratio": 1.2,
                      "price_to_book": 3, "price_to_sales": 5},
        "profitability": {"return_on_equity": 0.3, "profit_margin": 0.25,
                          "operating_margin": 0.3, "return_on_assets": 0.15},
        "growth": {"revenue_growth": 0.15, "earnings_growth": 0.18},
        "financial_health": {"debt_to_equity": 40, "current_ratio": 1.8,
                             "free_cashflow": 6e10},
    }
    for k, v in over.items():
        base[k] = {**base[k], **v}
    return base


def test_band_direction():
    assert scoring._band(12, 12, 45) == 100.0       # good anchor
    assert scoring._band(45, 12, 45) == 0.0          # bad anchor
    assert scoring._band(200, 30, 200) == 0.0        # lower-better, at bad


def test_negative_pe_is_excluded_not_scored_cheap():
    """A negative P/E must NOT band to a high 'cheap' score."""
    f = scoring.fundamental_score(_fund(valuation={"forward_pe": -20, "peg_ratio": -1}))
    val = next(p for p in f["pillars"] if p["name"] == "valuation")
    fpe = next(c for c in val["components"] if c["metric"] == "forward_pe")
    peg = next(c for c in val["components"] if c["metric"] == "peg_ratio")
    assert fpe["score"] is None  # excluded, not 100
    assert peg["score"] is None


def test_negative_debt_to_equity_is_not_pristine_health():
    """Negative D/E = negative shareholder equity (distress), must score 0, not 100."""
    f = scoring.fundamental_score(_fund(financial_health={"debt_to_equity": -50}))
    health = next(p for p in f["pillars"] if p["name"] == "health")
    dte = next(c for c in health["components"] if c["metric"] == "debt_to_equity")
    assert dte["score"] == 0.0  # floored, NOT banded up to 100


def test_strong_fundamentals_score_high():
    f = scoring.fundamental_score(_fund())
    assert f["score"] > 65
    assert f["coverage"] == 1.0


def test_fundamental_coverage_partial_when_fields_missing():
    sparse = {"valuation": {}, "profitability": {"return_on_equity": 0.3},
              "growth": {}, "financial_health": {}}
    f = scoring.fundamental_score(sparse)
    assert f["coverage"] < 0.5


def test_rsi_score_penalizes_overbought():
    assert scoring._rsi_score(85) < scoring._rsi_score(60)


def test_technical_score_uptrend_above_both_smas():
    tech = {"above_sma_50": True, "above_sma_200": True, "ma_cross": "golden",
            "rsi_14": 60, "position_52w": 80, "sma_200": 250}
    t = scoring.technical_score(tech)
    assert t["score"] > 70


def test_sentiment_excludes_news_uses_analyst_only():
    analysis = {"recommendation": "buy", "number_of_analysts": 30,
                "price_targets": {"upside_percent": 20},
                "trend": [{"strong_buy": 10, "buy": 20, "hold": 5, "sell": 1, "strong_sell": 0}]}
    s = scoring.sentiment_score(analysis)
    metrics = {c["metric"] for c in s["components"]}
    assert metrics == {"analyst_consensus", "recommendation_trend", "target_upside_pct"}
    assert "news" not in metrics  # demoted, not scored
    assert s["score"] > 60


def test_low_analyst_coverage_flagged():
    s = scoring.sentiment_score({"recommendation": "buy", "number_of_analysts": 2,
                                 "price_targets": {}, "trend": []})
    assert any("low-confidence" in n for n in s["notes"])


def test_insufficient_data_verdict_below_coverage_floor():
    sparse_fund = {"valuation": {}, "profitability": {}, "growth": {},
                   "financial_health": {}}
    report = scoring.build_report(
        "X", sparse_fund, {"rsi_14": None}, {"price_targets": {}, "trend": []},
        {"w_fundamental": 0.5, "w_technical": 0.3, "w_sentiment": 0.2},
    )
    assert report["verdict"] == "Insufficient data"


def test_composite_and_verdict_strong():
    report = scoring.build_report(
        "AAPL", _fund(),
        {"above_sma_50": True, "above_sma_200": True, "ma_cross": "golden",
         "rsi_14": 58, "position_52w": 75, "sma_200": 250},
        {"recommendation": "strong_buy", "number_of_analysts": 40,
         "price_targets": {"upside_percent": 22},
         "trend": [{"strong_buy": 15, "buy": 20, "hold": 5, "sell": 1, "strong_sell": 0}]},
        {"w_fundamental": 0.5, "w_technical": 0.3, "w_sentiment": 0.2},
    )
    assert report["composite"] > 65
    assert report["verdict"] in {"Buy", "Strong Buy"}
    assert report["coverage"] >= 0.5
    assert "not investment advice" in report["disclaimer"].lower()


def test_timing_descriptive_not_directive():
    report = scoring.build_report(
        "AAPL", _fund(),
        {"above_sma_50": False, "rsi_14": 32, "position_52w": 40, "sma_200": 250},
        {"recommendation": "buy", "number_of_analysts": 30,
         "price_targets": {"upside_percent": 18}, "trend": []},
        {"w_fundamental": 0.5, "w_technical": 0.3, "w_sentiment": 0.2},
    )
    setup = report["timing"]["setup"].lower()
    assert "buy now" not in setup  # descriptive, never directive
    assert report["timing"]["factors"]

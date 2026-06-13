"""Composite scoring — pure, deterministic, explainable.

Consumes our already-normalized dicts (fundamentals, technicals, analysis) and
emits 0-100 dimension scores plus a descriptive (non-directive) buy-setup.

Design decisions baked in (see methodology string):
* Banding is linear+clamped; `good`/`bad` anchors define direction.
* Negative / None valuation multiples (P/E, PEG, P/B, P/S) are EXCLUDED, never
  banded — a negative P/E is not "cheap", it means no earnings.
* News headlines are NOT scored (10 noisy headlines aren't a calibrated signal);
  sentiment = analyst consensus + recommendation trend + target upside only.
* Valuation anchors are ABSOLUTE and sector-blind — flagged loudly, not hidden.
* Below 50% overall coverage the verdict is "Insufficient data", not a number.
"""

from __future__ import annotations

DISCLAIMER = (
    "Educational research only — not investment advice. Scores are heuristic and "
    "deterministic, derived from delayed Yahoo Finance data."
)
METHODOLOGY = (
    "Fundamental = mean of Valuation/Quality/Growth/Health pillars (negative or "
    "missing multiples excluded). Technical = trend vs SMA50/200, MA cross, RSI, "
    "52-week position. Sentiment = analyst consensus, recommendation-trend ratio, "
    "and target upside (news is NOT scored). Composite = coverage-renormalized "
    "weighted blend. LIMITATION: valuation bands are absolute, not sector-relative "
    "— compare scores within a peer group, not across sectors."
)


def _band(value: float | None, good: float, bad: float) -> float | None:
    """Linear map to 0-100, clamped. good->100, bad->0 (good<bad => lower-better)."""
    if value is None or good == bad:
        return None
    raw = (value - bad) / (good - bad) * 100
    return max(0.0, min(100.0, raw))


def _comp(metric: str, value: float | None, score: float | None) -> dict:
    return {"metric": metric, "value": value, "score": score}


def _pillar(name: str, comps: list[dict]) -> dict:
    scored = [c["score"] for c in comps if c["score"] is not None]
    total = len(comps)
    return {
        "name": name,
        "score": (sum(scored) / len(scored)) if scored else None,
        "coverage": (len(scored) / total) if total else 0.0,
        "components": comps,
    }


def _mean(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return (sum(present) / len(present)) if present else None


# --- fundamental ----------------------------------------------------------
def _pos(value: float | None) -> float | None:
    """Positive-only gate: a non-positive multiple is meaningless, not cheap."""
    return value if (value is not None and value > 0) else None


def _dte_score(value: float | None) -> float | None:
    """Debt/equity score. A NEGATIVE value means negative shareholder equity
    (distress / buyback-driven), NOT low leverage — floor it to 0, never band it
    upward into a 'pristine balance sheet'."""
    if value is None:
        return None
    if value < 0:
        return 0.0
    return _band(value, 30, 200)


def fundamental_score(fund: dict) -> dict:
    val = fund.get("valuation", {})
    pro = fund.get("profitability", {})
    gro = fund.get("growth", {})
    hea = fund.get("financial_health", {})
    mcap = val.get("market_cap")
    fcf = hea.get("free_cashflow")
    fcf_yield = (fcf / mcap) if (fcf is not None and mcap) else None

    valuation = _pillar("valuation", [
        _comp("forward_pe", val.get("forward_pe"), _band(_pos(val.get("forward_pe")), 12, 45)),
        _comp("peg_ratio", val.get("peg_ratio"), _band(_pos(val.get("peg_ratio")), 1.0, 3.0)),
        _comp("price_to_book", val.get("price_to_book"), _band(_pos(val.get("price_to_book")), 1.5, 12)),
        _comp("price_to_sales", val.get("price_to_sales"), _band(_pos(val.get("price_to_sales")), 1.5, 15)),
    ])
    quality = _pillar("quality", [
        _comp("return_on_equity", pro.get("return_on_equity"), _band(pro.get("return_on_equity"), 0.25, 0.0)),
        _comp("profit_margin", pro.get("profit_margin"), _band(pro.get("profit_margin"), 0.25, 0.0)),
        _comp("operating_margin", pro.get("operating_margin"), _band(pro.get("operating_margin"), 0.30, 0.0)),
        _comp("return_on_assets", pro.get("return_on_assets"), _band(pro.get("return_on_assets"), 0.12, 0.0)),
    ])
    growth = _pillar("growth", [
        _comp("revenue_growth", gro.get("revenue_growth"), _band(gro.get("revenue_growth"), 0.20, -0.05)),
        _comp("earnings_growth", gro.get("earnings_growth"), _band(gro.get("earnings_growth"), 0.20, -0.10)),
    ])
    health = _pillar("health", [
        _comp("debt_to_equity", hea.get("debt_to_equity"), _dte_score(hea.get("debt_to_equity"))),
        _comp("current_ratio", hea.get("current_ratio"), _band(hea.get("current_ratio"), 2.0, 0.5)),
        _comp("fcf_yield", fcf_yield, _band(fcf_yield, 0.06, 0.0)),
    ])
    pillars = [valuation, quality, growth, health]
    dim = _mean([p["score"] for p in pillars])
    cov = _mean([p["coverage"] for p in pillars]) or 0.0
    return {"score": dim, "coverage": cov, "pillars": pillars, "components": [], "notes": []}


# --- technical ------------------------------------------------------------
def _rsi_score(rsi: float | None) -> float | None:
    """Bullish-strength view: rewards momentum, penalizes overbought >70."""
    if rsi is None:
        return None
    if rsi <= 70:
        return max(0.0, min(100.0, rsi * (85 / 70)))  # 70 -> ~85
    return max(0.0, 85 - (rsi - 70) * 2)  # fade as it gets overbought


def technical_score(tech: dict) -> dict:
    above50, above200 = tech.get("above_sma_50"), tech.get("above_sma_200")
    trend_score = None
    if above50 is not None or above200 is not None:
        trend_score = (
            100 if (above50 and above200)
            else 55 if (above50 or above200)
            else 15
        )
    cross = tech.get("ma_cross")
    cross_score = (100.0 if cross == "golden" else 0.0) if cross else None
    pos = tech.get("position_52w")
    pos_score = None
    if pos is not None:
        pos_score = max(0.0, pos - (pos - 95) * 3) if pos > 95 else pos  # fade if extended
    comps = [
        _comp("trend_vs_sma", None, trend_score),
        _comp("ma_cross", None, cross_score),
        _comp("rsi_14", tech.get("rsi_14"), _rsi_score(tech.get("rsi_14"))),
        _comp("position_52w", pos, pos_score),
    ]
    scored = [c["score"] for c in comps if c["score"] is not None]
    notes = []
    if tech.get("sma_200") is None:
        notes.append("SMA200 unavailable (short price history) — trend score partial.")
    return {
        "score": (sum(scored) / len(scored)) if scored else None,
        "coverage": len(scored) / len(comps),
        "pillars": [],
        "components": comps,
        "notes": notes,
    }


# --- sentiment ------------------------------------------------------------
_RECO = {"strong_buy": 100, "buy": 80, "outperform": 80, "hold": 50, "neutral": 50,
         "underperform": 25, "sell": 20, "strong_sell": 0}


def sentiment_score(analysis: dict) -> dict:
    key = (analysis.get("recommendation") or "").lower().replace(" ", "_")
    reco_score = float(_RECO[key]) if key in _RECO else None

    trend = analysis.get("trend") or []
    trend_score = None
    if trend:
        r = trend[0]
        total = r["strong_buy"] + r["buy"] + r["hold"] + r["sell"] + r["strong_sell"]
        if total:
            trend_score = (r["strong_buy"] + r["buy"]) / total * 100

    upside = (analysis.get("price_targets") or {}).get("upside_percent")
    upside_score = _band(upside, 25, -10)

    comps = [
        _comp("analyst_consensus", None, reco_score),
        _comp("recommendation_trend", None, trend_score),
        _comp("target_upside_pct", upside, upside_score),
    ]
    scored = [c["score"] for c in comps if c["score"] is not None]
    n = analysis.get("number_of_analysts")
    notes = []
    if n is not None and n < 5:
        notes.append(f"Low analyst coverage ({n}) — sentiment is low-confidence.")
    return {
        "score": (sum(scored) / len(scored)) if scored else None,
        "coverage": len(scored) / len(comps),
        "pillars": [],
        "components": comps,
        "notes": notes,
    }


# --- composite + timing ---------------------------------------------------
_VERDICTS = [(80, "Strong Buy"), (65, "Buy"), (45, "Hold"), (30, "Reduce"), (0, "Avoid")]


def _verdict(score: float) -> str:
    for threshold, label in _VERDICTS:
        if score >= threshold:
            return label
    return "Avoid"


def timing_signal(fund: dict, tech: dict, analysis: dict) -> dict:
    factors: list[str] = []
    rsi = tech.get("rsi_14")
    pos = tech.get("position_52w")
    upside = (analysis.get("price_targets") or {}).get("upside_percent")
    fund_score = fund.get("score")

    cheap = bool(upside is not None and upside > 12)
    oversold = bool(rsi is not None and rsi < 38)
    pullback = tech.get("above_sma_50") is False
    overbought = bool(rsi is not None and rsi > 75)
    extended = bool(pos is not None and pos > 95)
    strong = bool(fund_score is not None and fund_score >= 60)
    weak = bool(fund_score is not None and fund_score < 40)

    if cheap:
        factors.append(f"trades ~{upside:.0f}% below mean analyst target")
    if oversold:
        factors.append(f"oversold (RSI {rsi:.0f})")
    if pullback:
        factors.append("below 50-day average (pullback)")
    if overbought:
        factors.append(f"overbought (RSI {rsi:.0f})")
    if extended:
        factors.append("near 52-week high (extended)")
    if strong:
        factors.append("solid fundamentals")
    if weak:
        factors.append("weak fundamentals")

    if weak:
        setup = "weak fundamentals — quality concern regardless of price"
    elif overbought or extended:
        setup = "extended — wait for a pullback"
    elif strong and (cheap or oversold or pullback):
        setup = "constructive entry setup — quality with a valuation/technical pullback"
    elif strong:
        setup = "quality name near fair value"
    else:
        setup = "mixed — no clear edge"
    return {"setup": setup, "factors": factors or ["no notable conditions"]}


def build_report(symbol: str, fund: dict, tech: dict, analysis: dict,
                 weights: dict) -> dict:
    f = fundamental_score(fund)
    t = technical_score(tech)
    s = sentiment_score(analysis)

    dims = [("fundamental", f, weights["w_fundamental"]),
            ("technical", t, weights["w_technical"]),
            ("sentiment", s, weights["w_sentiment"])]
    active = [(d, w) for _, d, w in dims if d["score"] is not None and w > 0]
    composite = None
    if active:
        wsum = sum(w for _, w in active)
        if wsum > 0:
            composite = sum(d["score"] * w for d, w in active) / wsum

    coverage = _mean([f["coverage"], t["coverage"], s["coverage"]]) or 0.0
    if composite is None or coverage < 0.5:
        verdict = "Insufficient data"
    else:
        verdict = _verdict(composite)

    return {
        "symbol": symbol,
        "fundamental": f,
        "technical": t,
        "sentiment": s,
        "composite": composite,
        "verdict": verdict,
        "timing": timing_signal(f, tech, analysis),
        "weights": weights,
        "coverage": coverage,
        "methodology": METHODOLOGY,
        "disclaimer": DISCLAIMER,
    }

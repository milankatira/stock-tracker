"""Stock Research Terminal — Streamlit UI over the Stock Research API.

Run:  make ui   (or)   streamlit run frontend/app.py
The FastAPI backend must be running (make dev) — this UI is a pure client.
"""

from __future__ import annotations

import os

import pandas as pd
import streamlit as st

from frontend import api, components, theme

st.set_page_config(page_title="Stock Research Terminal", page_icon="📈", layout="wide")

DEFAULT_BASE = os.getenv("STOCK_API_URL", api.DEFAULT_BASE_URL)


# --- cached fetchers (keyed on base_url + symbol; tabs re-run on every interaction) ---
@st.cache_data(ttl=30, show_spinner=False)
def c_quote(base, sym):
    return api.quote(base, sym)


@st.cache_data(ttl=900, show_spinner=False)
def c_score(base, sym):
    return api.score(base, sym)


@st.cache_data(ttl=3600, show_spinner=False)
def c_profile(base, sym):
    return api.profile(base, sym)


@st.cache_data(ttl=3600, show_spinner=False)
def c_fundamentals(base, sym):
    return api.fundamentals(base, sym)


@st.cache_data(ttl=900, show_spinner=False)
def c_technicals(base, sym):
    return api.technicals(base, sym)


@st.cache_data(ttl=900, show_spinner=False)
def c_returns(base, sym):
    return api.returns(base, sym)


@st.cache_data(ttl=900, show_spinner=False)
def c_analysis(base, sym):
    return api.analysis(base, sym)


@st.cache_data(ttl=1800, show_spinner=False)
def c_earnings(base, sym):
    return api.earnings(base, sym)


@st.cache_data(ttl=1800, show_spinner=False)
def c_holders(base, sym):
    return api.holders(base, sym)


@st.cache_data(ttl=600, show_spinner=False)
def c_news(base, sym):
    return api.news(base, sym)


@st.cache_data(ttl=600, show_spinner=False)
def c_history(base, sym, period, interval):
    return api.history(base, sym, period, interval)


@st.cache_data(ttl=1800, show_spinner=False)
def c_financials(base, sym, statement, freq):
    return api.financials(base, sym, statement, freq)


@st.cache_data(ttl=30, show_spinner=False)
def c_watchlist(base):
    return api.watchlist_quotes(base)


def safe(fn, *args):
    """Call a fetcher, returning (data, error_message)."""
    try:
        return fn(*args), None
    except api.ApiError as exc:
        return None, str(exc)


# --- sidebar -----------------------------------------------------------------
with st.sidebar:
    st.header("📈 Research Terminal")
    base_url = st.text_input("Backend URL", value=DEFAULT_BASE)
    with st.form("ticker_form"):
        symbol_in = st.text_input("Ticker", value=st.session_state.get("symbol", "AAPL"))
        submitted = st.form_submit_button("Analyze", width='stretch', type="primary")
    if submitted and symbol_in.strip():
        st.session_state["symbol"] = symbol_in.strip().upper()
    st.divider()
    st.caption("Watchlist is saved in MongoDB — see the Watchlist tab.")


# --- health gate (loud, once) ------------------------------------------------
_, health_err = safe(api.health, base_url)
if health_err:
    st.error(f"⚠️ {health_err}")
    st.info("Start the backend:  `make dev`  (defaults to http://127.0.0.1:8000)")
    st.stop()

symbol = st.session_state.get("symbol", "AAPL")


# --- header (verdict is the lead) --------------------------------------------
def render_header():
    score_data, score_err = safe(c_score, base_url, symbol)
    quote_data, quote_err = safe(c_quote, base_url, symbol)
    profile_data, _ = safe(c_profile, base_url, symbol)

    name = (profile_data or {}).get("name") or symbol
    c1, c2, c3, c4 = st.columns([3, 2, 2, 2])
    with c1:
        st.markdown(f"### {name}")
        st.caption(symbol)
        with st.popover("➕ Add to Watchlist"):
            note = st.text_input("Note (optional)", key=f"wl_note_{symbol}",
                                 placeholder="e.g. oversold, watching for entry")
            if st.button("Save", key=f"wl_add_{symbol}", type="primary"):
                _, add_err = safe(api.watchlist_add, base_url, symbol, note)
                if add_err:
                    st.error(add_err)
                else:
                    c_watchlist.clear()
                    st.toast(f"Added {symbol} to watchlist", icon="✅")
    with c2:
        if quote_data:
            chg = quote_data.get("change_percent")
            st.metric("Price", theme.fmt(quote_data.get("last_price")),
                      f"{chg:.2f}%" if chg is not None else None)
        elif quote_err:
            st.caption(quote_err)
    with c3:
        if score_data:
            verdict = score_data.get("verdict", "—")
            color = theme.verdict_color(verdict)
            st.markdown(
                f"<div style='padding:10px;border-radius:8px;background:{color};"
                f"color:white;text-align:center;font-weight:700;font-size:1.1rem;'>"
                f"{verdict}</div>", unsafe_allow_html=True)
    with c4:
        if score_data and score_data.get("composite") is not None:
            st.metric("Composite", f"{score_data['composite']:.0f}/100")
    return score_data, score_err


score_data, score_err = render_header()
st.divider()

tabs = st.tabs(["Overview", "Score", "Chart", "Fundamentals",
                "Analysts & Earnings", "Ownership", "News", "Watchlist"])

# --- Overview ----------------------------------------------------------------
with tabs[0]:
    quote_data, _ = safe(c_quote, base_url, symbol)
    profile_data, _ = safe(c_profile, base_url, symbol)
    returns_data, _ = safe(c_returns, base_url, symbol)
    if quote_data:
        cols = st.columns(4)
        items = [
            ("Last", theme.fmt(quote_data.get("last_price"))),
            ("Prev Close", theme.fmt(quote_data.get("previous_close"))),
            ("Day Range", f"{theme.fmt(quote_data.get('day_low'))}–{theme.fmt(quote_data.get('day_high'))}"),
            ("52w Range", f"{theme.fmt(quote_data.get('year_low'))}–{theme.fmt(quote_data.get('year_high'))}"),
            ("Market Cap", theme.fmt(quote_data.get("market_cap"), money=True)),
            ("Volume", theme.fmt(quote_data.get("volume"))),
            ("50d Avg", theme.fmt(quote_data.get("fifty_day_average"))),
            ("200d Avg", theme.fmt(quote_data.get("two_hundred_day_average"))),
        ]
        for i, (label, val) in enumerate(items):
            cols[i % 4].metric(label, val)
    if returns_data:
        st.subheader("Trailing returns")
        rcols = st.columns(7)
        for i, key in enumerate(["1d", "1w", "1mo", "3mo", "6mo", "1y", "ytd"]):
            rcols[i].metric(key.upper(), theme.fmt(returns_data.get(key), pct=True))
    if profile_data:
        st.subheader("Profile")
        meta = " · ".join(filter(None, [profile_data.get("sector"),
                                        profile_data.get("industry"),
                                        profile_data.get("country")]))
        st.caption(meta)
        st.write(profile_data.get("summary") or "No description available.")

# --- Score -------------------------------------------------------------------
with tabs[1]:
    if score_err:
        st.warning(score_err)
    elif score_data:
        left, right = st.columns([1, 1])
        with left:
            st.plotly_chart(components.score_gauge(score_data.get("composite"),
                            score_data.get("verdict", "—")), width='stretch')
            st.caption(f"Coverage: {score_data.get('coverage', 0) * 100:.0f}%")
        with right:
            st.plotly_chart(components.dimension_bars(
                score_data["fundamental"].get("score"),
                score_data["technical"].get("score"),
                score_data["sentiment"].get("score")), width='stretch')
        timing = score_data.get("timing", {})
        st.subheader("Setup")
        st.info(f"**{timing.get('setup', '—')}**\n\n" +
                " · ".join(timing.get("factors", [])))

        for dim_key in ("fundamental", "technical", "sentiment"):
            dim = score_data.get(dim_key, {})
            with st.expander(f"{dim_key.title()} — "
                             f"{theme.fmt(dim.get('score'))} "
                             f"({dim.get('coverage', 0) * 100:.0f}% coverage)"):
                rows = []
                for pillar in dim.get("pillars", []):
                    for comp in pillar.get("components", []):
                        rows.append({"pillar": pillar["name"], "metric": comp["metric"],
                                     "value": comp["value"], "score": comp["score"]})
                for comp in dim.get("components", []):
                    rows.append({"pillar": "—", "metric": comp["metric"],
                                 "value": comp["value"], "score": comp["score"]})
                if rows:
                    st.dataframe(pd.DataFrame(rows), width='stretch', hide_index=True)
                for note in dim.get("notes", []):
                    st.caption(f"ℹ️ {note}")

        # Carry the backend's honesty discipline into the UI.
        st.caption("**Methodology** — " + score_data.get("methodology", ""))
        st.caption("⚠️ " + score_data.get("disclaimer", ""))

# --- Chart -------------------------------------------------------------------
with tabs[2]:
    c1, c2 = st.columns(2)
    # Default 2y so the SMA200 overlay actually renders (needs ~200 bars).
    period = c1.selectbox("Period", ["6mo", "1y", "2y", "5y", "max"], index=2)
    interval = c2.selectbox("Interval", ["1d", "1wk", "1mo"], index=0)
    hist, hist_err = safe(c_history, base_url, symbol, period, interval)
    tech, _ = safe(c_technicals, base_url, symbol)
    if tech:
        tcols = st.columns(5)
        tcols[0].metric("RSI(14)", theme.fmt(tech.get("rsi_14")))
        tcols[1].metric("SMA50", theme.fmt(tech.get("sma_50")))
        tcols[2].metric("SMA200", theme.fmt(tech.get("sma_200")))
        tcols[3].metric("MA cross", tech.get("ma_cross") or "—")
        tcols[4].metric("52w pos", theme.fmt(tech.get("position_52w"), pct=True))
    if hist_err:
        st.warning(hist_err)
    elif hist:
        fig = components.price_chart(hist.get("bars", []))
        if fig:
            st.plotly_chart(fig, width='stretch')
        else:
            st.info("No price history available.")

# --- Fundamentals ------------------------------------------------------------
with tabs[3]:
    fund, fund_err = safe(c_fundamentals, base_url, symbol)
    if fund_err:
        st.warning(fund_err)
    elif fund:
        groups = [
            ("Valuation", fund.get("valuation", {})),
            ("Profitability", fund.get("profitability", {})),
            ("Growth", fund.get("growth", {})),
            ("Financial Health", fund.get("financial_health", {})),
            ("Dividend", fund.get("dividend", {})),
        ]
        for title, data in groups:
            st.subheader(title)
            cols = st.columns(4)
            for i, (k, v) in enumerate(data.items()):
                money = any(t in k for t in ("cash", "debt", "cashflow", "market_cap", "enterprise"))
                cols[i % 4].metric(k.replace("_", " ").title(),
                                   theme.fmt(v, money=money))
    st.divider()
    st.subheader("Financial statements")
    sc1, sc2 = st.columns(2)
    statement = sc1.selectbox("Statement", ["income", "balance", "cashflow"])
    freq = sc2.selectbox("Frequency", ["annual", "quarterly"])
    stmt, stmt_err = safe(c_financials, base_url, symbol, statement, freq)
    if stmt_err:
        st.warning(stmt_err)
    elif stmt and stmt.get("periods"):
        df = pd.DataFrame(stmt["periods"]).set_index("date").T
        st.dataframe(df, width='stretch')
    else:
        st.info("No statement data available.")

# --- Analysts & Earnings -----------------------------------------------------
with tabs[4]:
    analysis_data, an_err = safe(c_analysis, base_url, symbol)
    if an_err:
        st.warning(an_err)
    elif analysis_data:
        pt = analysis_data.get("price_targets", {})
        cols = st.columns(5)
        cols[0].metric("Consensus", (analysis_data.get("recommendation") or "—").title())
        cols[1].metric("Analysts", analysis_data.get("number_of_analysts") or "—")
        cols[2].metric("Target (mean)", theme.fmt(pt.get("mean")))
        cols[3].metric("Target range", f"{theme.fmt(pt.get('low'))}–{theme.fmt(pt.get('high'))}")
        cols[4].metric("Upside", theme.fmt(pt.get("upside_percent"), pct=True))
        fig = components.recommendation_trend(analysis_data.get("trend", []))
        if fig:
            st.plotly_chart(fig, width='stretch')
    earn, earn_err = safe(c_earnings, base_url, symbol)
    st.subheader("Earnings")
    if earn_err:
        st.warning(earn_err)
    elif earn:
        if earn.get("upcoming"):
            st.caption("Recent / upcoming")
            st.dataframe(pd.DataFrame(earn["upcoming"]), width='stretch', hide_index=True)
        if earn.get("estimates"):
            st.caption("EPS estimates")
            st.dataframe(pd.DataFrame(earn["estimates"]), width='stretch', hide_index=True)

# --- Ownership ---------------------------------------------------------------
with tabs[5]:
    hold, hold_err = safe(c_holders, base_url, symbol)
    if hold_err:
        st.warning(hold_err)
    elif hold:
        summ = hold.get("summary", {})
        if summ:
            cols = st.columns(len(summ) or 1)
            for i, (k, v) in enumerate(summ.items()):
                cols[i].metric(k, theme.fmt(v))
        if hold.get("institutional"):
            st.subheader("Top institutional holders")
            st.dataframe(pd.DataFrame(hold["institutional"]), width='stretch', hide_index=True)
        if hold.get("insider_transactions"):
            st.subheader("Insider transactions")
            st.dataframe(pd.DataFrame(hold["insider_transactions"]), width='stretch', hide_index=True)

# --- News --------------------------------------------------------------------
with tabs[6]:
    news_data, news_err = safe(c_news, base_url, symbol)
    if news_err:
        st.warning(news_err)
    elif news_data:
        for item in news_data:
            st.markdown(f"**{item.get('title') or 'Untitled'}**")
            meta = " · ".join(filter(None, [item.get("publisher"), item.get("published_at")]))
            st.caption(meta)
            if item.get("summary"):
                st.write(item["summary"])
            if item.get("url"):
                st.markdown(f"[Read more →]({item['url']})")
            st.divider()
    else:
        st.info("No news available.")

# --- Watchlist (persisted in MongoDB) ----------------------------------------
with tabs[7]:
    c_head, c_refresh = st.columns([5, 1])
    c_head.caption("Saved in MongoDB. Open any stock and click ➕ Add to Watchlist.")
    if c_refresh.button("↻ Refresh", key="wl_refresh"):
        c_watchlist.clear()
        st.rerun()

    wl, wl_err = safe(c_watchlist, base_url)
    if wl_err:
        st.warning(wl_err)
    elif not wl:
        st.info("Watchlist is empty. Add a symbol from its profile header.")
    else:
        for q in wl:
            sym = q.get("symbol")
            cols = st.columns([2, 2, 2, 4, 1])
            chg = q.get("change_percent")
            cols[0].metric(sym, theme.fmt(q.get("last_price")),
                           f"{chg:.2f}%" if isinstance(chg, (int, float)) else None)
            cols[1].metric("Market Cap", theme.fmt(q.get("market_cap"), money=True))
            cols[2].metric("Prev Close", theme.fmt(q.get("previous_close")))
            note = q.get("note")
            status = q.get("error")
            cols[3].caption((f"📝 {note}" if note else "") +
                            (f"  ⚠️ {status}" if status else ""))
            if cols[4].button("🗑", key=f"wl_rm_{sym}", help=f"Remove {sym}"):
                _, rm_err = safe(api.watchlist_remove, base_url, sym)
                if rm_err:
                    st.error(rm_err)
                else:
                    c_watchlist.clear()
                    st.rerun()

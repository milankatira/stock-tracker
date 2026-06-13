"""Plotly chart builders — pure (data in, Figure out), no Streamlit/network."""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from frontend import theme


def score_gauge(score: float | None, verdict: str) -> go.Figure:
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=score if score is not None else 0,
        number={"suffix": "", "font": {"size": 40}},
        title={"text": f"<b>{verdict}</b>", "font": {"size": 22}},
        gauge={
            "axis": {"range": [0, 100]},
            "bar": {"color": theme.score_color(score)},
            "steps": [
                {"range": [0, 30], "color": "#fee2e2"},
                {"range": [30, 45], "color": "#ffedd5"},
                {"range": [45, 55], "color": "#fef9c3"},
                {"range": [55, 70], "color": "#ecfccb"},
                {"range": [70, 100], "color": "#dcfce7"},
            ],
        },
    ))
    fig.update_layout(height=240, margin=dict(l=20, r=20, t=50, b=10))
    return fig


def dimension_bars(fundamental: float | None, technical: float | None,
                   sentiment: float | None) -> go.Figure:
    dims = [("Fundamental", fundamental), ("Technical", technical), ("Sentiment", sentiment)]
    names = [d[0] for d in dims]
    values = [d[1] if d[1] is not None else 0 for d in dims]
    colors = [theme.score_color(d[1]) for d in dims]
    fig = go.Figure(go.Bar(
        x=values, y=names, orientation="h", marker_color=colors,
        text=[theme.fmt(d[1]) if d[1] is not None else "n/a" for d in dims],
        textposition="outside",
    ))
    fig.update_layout(
        height=220, margin=dict(l=10, r=10, t=10, b=10),
        xaxis=dict(range=[0, 100], title="Score (0–100)"),
    )
    return fig


def price_chart(bars: list[dict]) -> go.Figure | None:
    """Candlestick + SMA50/SMA200 overlay + volume + RSI(14). Overlays are
    guarded: SMA200 needs ~200 bars or it is simply omitted (no broken NaN line)."""
    if not bars:
        return None
    df = pd.DataFrame(bars)
    # Bars span DST changes, so ISO timestamps carry mixed UTC offsets
    # (-04:00 / -05:00); utc=True normalizes them to one timezone.
    df["date"] = pd.to_datetime(df["date"], utc=True)
    df = df.sort_values("date")

    fig = make_subplots(
        rows=3, cols=1, shared_xaxes=True, vertical_spacing=0.03,
        row_heights=[0.62, 0.16, 0.22],
        specs=[[{}], [{}], [{}]],
    )
    fig.add_trace(go.Candlestick(
        x=df["date"], open=df["open"], high=df["high"], low=df["low"],
        close=df["close"], name="Price",
    ), row=1, col=1)

    for window, color in ((50, "#2563eb"), (200, "#9333ea")):
        if len(df) >= window:
            sma = df["close"].rolling(window).mean()
            fig.add_trace(go.Scatter(
                x=df["date"], y=sma, name=f"SMA{window}",
                line=dict(color=color, width=1.4),
            ), row=1, col=1)

    fig.add_trace(go.Bar(
        x=df["date"], y=df["volume"], name="Volume", marker_color="#94a3b8",
    ), row=2, col=1)

    # RSI(14) computed client-side for the subplot.
    delta = df["close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    fig.add_trace(go.Scatter(x=df["date"], y=rsi, name="RSI(14)",
                             line=dict(color="#0891b2", width=1.2)), row=3, col=1)
    fig.add_hline(y=70, line_dash="dot", line_color="#dc2626", row=3, col=1)
    fig.add_hline(y=30, line_dash="dot", line_color="#16a34a", row=3, col=1)

    fig.update_layout(
        height=620, margin=dict(l=10, r=10, t=20, b=10),
        xaxis_rangeslider_visible=False, showlegend=True,
        legend=dict(orientation="h", y=1.02, yanchor="bottom"),
    )
    fig.update_yaxes(title_text="Price", row=1, col=1)
    fig.update_yaxes(title_text="Vol", row=2, col=1)
    fig.update_yaxes(title_text="RSI", range=[0, 100], row=3, col=1)
    return fig


def recommendation_trend(trend: list[dict]) -> go.Figure | None:
    if not trend:
        return None
    df = pd.DataFrame(trend)
    fig = go.Figure()
    series = [
        ("strong_buy", "#15803d"), ("buy", "#22c55e"), ("hold", "#eab308"),
        ("sell", "#f97316"), ("strong_sell", "#dc2626"),
    ]
    for key, color in series:
        if key in df.columns:
            fig.add_trace(go.Bar(x=df["period"], y=df[key],
                                 name=key.replace("_", " ").title(), marker_color=color))
    fig.update_layout(barmode="stack", height=280, margin=dict(l=10, r=10, t=10, b=10),
                      xaxis_title="Period (relative month)", yaxis_title="Analysts")
    return fig

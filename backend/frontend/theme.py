"""Shared visual vocabulary — verdict colors and score scales."""

from __future__ import annotations

VERDICT_COLORS = {
    "Strong Buy": "#15803d",
    "Buy": "#22c55e",
    "Hold": "#eab308",
    "Reduce": "#f97316",
    "Avoid": "#dc2626",
    "Insufficient data": "#6b7280",
}


def verdict_color(verdict: str) -> str:
    return VERDICT_COLORS.get(verdict, "#6b7280")


def score_color(score: float | None) -> str:
    """Green (strong) -> red (weak) on a 0-100 scale."""
    if score is None:
        return "#6b7280"
    if score >= 70:
        return "#22c55e"
    if score >= 55:
        return "#84cc16"
    if score >= 45:
        return "#eab308"
    if score >= 30:
        return "#f97316"
    return "#dc2626"


def fmt(value, suffix: str = "", pct: bool = False, money: bool = False) -> str:
    """Human-readable number formatting with graceful None handling."""
    if value is None:
        return "—"
    try:
        v = float(value)
    except (TypeError, ValueError):
        return str(value)
    if money:
        for unit, scale in (("T", 1e12), ("B", 1e9), ("M", 1e6), ("K", 1e3)):
            if abs(v) >= scale:
                return f"${v / scale:.2f}{unit}"
        return f"${v:,.2f}"
    if pct:
        return f"{v:.2f}%"
    return f"{v:,.2f}{suffix}"

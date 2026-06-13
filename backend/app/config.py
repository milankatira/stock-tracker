"""Runtime configuration.

Values come from environment variables with sensible defaults so the service
runs with zero config locally. Cache TTLs are split by data volatility — a pro
research API does not cache a live price the same way it caches annual filings.
"""

from __future__ import annotations

import os

# --- Cache TTLs (seconds) -------------------------------------------------
# Live snapshot: changes every tick during market hours.
QUOTE_TTL: int = int(os.getenv("QUOTE_TTL", "30"))
# Company profile / fundamentals: derived from the heavy `.info` scrape,
# effectively static intraday.
INFO_TTL: int = int(os.getenv("INFO_TTL", "3600"))
# Statements, history, analyst views: update at most daily.
SLOW_TTL: int = int(os.getenv("SLOW_TTL", "1800"))
# News: refreshes through the day.
NEWS_TTL: int = int(os.getenv("NEWS_TTL", "600"))

# --- HTTP -----------------------------------------------------------------
# Comma-separated allow-list; "*" permitted for local dev only.
CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
]

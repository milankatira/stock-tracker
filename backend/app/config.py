"""Runtime configuration.

Values come from environment variables with sensible defaults so the service
runs with zero config locally. Cache TTLs are split by data volatility — a pro
research API does not cache a live price the same way it caches annual filings.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

# Load backend/.env (gitignored) so secrets stay out of source. No-op in prod
# where real env vars are already set.
load_dotenv()

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

# --- MongoDB (watchlist persistence) --------------------------------------
# Connection string loaded from env/.env — never hardcoded. Empty by default so
# imports never fail; the watchlist routes surface a clean 503 if it is unset.
MONGODB_URI: str = os.getenv("MONGODB_URI", "")
# Database + collection names (the SRV URI already names a default db, but we
# stay explicit so the watchlist is portable across clusters).
MONGODB_DB: str = os.getenv("MONGODB_DB", "tracker")
WATCHLIST_COLLECTION: str = os.getenv("WATCHLIST_COLLECTION", "watchlist")
# Fail fast on a down/unreachable cluster instead of pymongo's 30s default.
MONGODB_TIMEOUT_MS: int = int(os.getenv("MONGODB_TIMEOUT_MS", "5000"))

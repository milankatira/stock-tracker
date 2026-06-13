"""HTTP client for the Stock Research API.

The only meaningfully unit-testable layer of the frontend: thin wrappers that
return plain dicts (never Response objects — those aren't safely cacheable) and
translate transport/HTTP errors into a single `ApiError` the UI can render.

Streamlit caching lives here: `st.cache_data` keys on (base_url, symbol, ...),
so switching tabs (which re-runs every tab body) doesn't re-hammer the backend.
"""

from __future__ import annotations

import requests

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
_TIMEOUT = 20


class ApiError(Exception):
    """User-facing API failure with a friendly message."""


def _get(base_url: str, path: str, params: dict | None = None) -> dict | list:
    url = f"{base_url.rstrip('/')}{path}"
    try:
        resp = requests.get(url, params=params, timeout=_TIMEOUT)
    except requests.exceptions.ConnectionError as exc:
        raise ApiError(f"Backend unreachable at {base_url} — is `make dev` running?") from exc
    except requests.exceptions.Timeout as exc:
        raise ApiError(f"Backend timed out after {_TIMEOUT}s.") from exc
    except requests.exceptions.RequestException as exc:  # pragma: no cover - defensive
        raise ApiError(f"Request failed: {exc}") from exc

    if resp.status_code == 404:
        raise ApiError("Symbol not found.")
    if resp.status_code == 422:
        raise ApiError("Invalid request (check the symbol).")
    if resp.status_code >= 500:
        raise ApiError(f"Backend error ({resp.status_code}). Upstream data may be unavailable.")
    if not resp.ok:
        raise ApiError(f"Unexpected response ({resp.status_code}).")
    try:
        return resp.json()
    except ValueError as exc:
        raise ApiError("Backend returned a non-JSON response.") from exc


def health(base_url: str) -> dict:
    return _get(base_url, "/health")  # type: ignore[return-value]


# --- per-symbol --------------------------------------------------------------
def quote(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/quote")  # type: ignore[return-value]


def profile(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/profile")  # type: ignore[return-value]


def fundamentals(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/fundamentals")  # type: ignore[return-value]


def technicals(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/technicals")  # type: ignore[return-value]


def returns(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/returns")  # type: ignore[return-value]


def analysis(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/analysis")  # type: ignore[return-value]


def earnings(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/earnings")  # type: ignore[return-value]


def holders(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/holders")  # type: ignore[return-value]


def news(base_url: str, symbol: str, limit: int = 12) -> list:
    return _get(base_url, f"/v1/stocks/{symbol}/news", {"limit": limit})  # type: ignore[return-value]


def score(base_url: str, symbol: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/score")  # type: ignore[return-value]


def history(base_url: str, symbol: str, period: str = "2y", interval: str = "1d") -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/history",
                {"period": period, "interval": interval})  # type: ignore[return-value]


def financials(base_url: str, symbol: str, statement: str, freq: str) -> dict:
    return _get(base_url, f"/v1/stocks/{symbol}/financials",
                {"statement": statement, "freq": freq})  # type: ignore[return-value]


def batch_quotes(base_url: str, symbols: list[str]) -> list:
    return _get(base_url, "/v1/stocks/quotes", {"symbols": ",".join(symbols)})  # type: ignore[return-value]

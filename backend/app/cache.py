"""Thread-safe in-process TTL cache with single-flight and negative caching.

yfinance hits Yahoo over the network and is rate-limited, so every endpoint
projects from a cached upstream fetch instead of re-scraping. Handlers are plain
`def` (FastAPI runs them in a threadpool), hence the locking.

* **Single-flight**: concurrent cold requests for the same key wait on a
  per-key lock so the upstream is hit ONCE, not N times.
* **Negative caching**: a designated failure (e.g. unknown symbol) is cached for
  a short window so garbage tickers don't hammer the upstream on every request.

Per-key locks mean a slow fetch for symbol A never blocks reads for symbol B.
"""

from __future__ import annotations

import threading
import time
from typing import Callable, TypeVar

T = TypeVar("T")


class _CachedError:
    __slots__ = ("exc",)

    def __init__(self, exc: BaseException) -> None:
        self.exc = exc


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, object]] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    def _read(self, key: str) -> tuple[bool, object]:
        now = time.monotonic()
        with self._guard:
            entry = self._store.get(key)
            if entry is not None and entry[0] > now:
                return True, entry[1]
        return False, None

    def _key_lock(self, key: str) -> threading.Lock:
        with self._guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = self._locks[key] = threading.Lock()
            return lock

    def get_or_fetch(
        self,
        key: str,
        ttl: int,
        fetch: Callable[[], T],
        *,
        error_types: tuple[type[BaseException], ...] = (),
        error_ttl: int = 60,
    ) -> T:
        hit, value = self._read(key)
        if hit:
            if isinstance(value, _CachedError):
                raise value.exc
            return value  # type: ignore[return-value]

        # Single-flight: only one thread fetches a cold key.
        with self._key_lock(key):
            hit, value = self._read(key)  # double-check after acquiring
            if hit:
                if isinstance(value, _CachedError):
                    raise value.exc
                return value  # type: ignore[return-value]

            try:
                result = fetch()
            except error_types as exc:
                with self._guard:
                    self._store[key] = (time.monotonic() + error_ttl, _CachedError(exc))
                raise

            with self._guard:
                self._store[key] = (time.monotonic() + ttl, result)
            return result

    def clear(self) -> None:
        with self._guard:
            self._store.clear()
            self._locks.clear()


cache = TTLCache()

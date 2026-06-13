"""TTLCache behavior: single-flight and negative caching."""

from __future__ import annotations

import threading
import time

from app.cache import TTLCache


class Boom(Exception):
    pass


def test_value_is_cached_until_ttl():
    c = TTLCache()
    calls = []
    fetch = lambda: calls.append(1) or "v"  # noqa: E731
    assert c.get_or_fetch("k", 60, fetch) == "v"
    assert c.get_or_fetch("k", 60, fetch) == "v"
    assert len(calls) == 1  # second read served from cache


def test_single_flight_fetches_once_under_concurrency():
    c = TTLCache()
    calls = []

    def slow():
        time.sleep(0.05)
        calls.append(1)
        return "v"

    threads = [threading.Thread(target=lambda: c.get_or_fetch("k", 60, slow))
               for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(calls) == 1  # 10 concurrent cold readers -> ONE fetch


def test_negative_cache_suppresses_repeat_failures():
    c = TTLCache()
    calls = []

    def boom():
        calls.append(1)
        raise Boom("no such symbol")

    for _ in range(3):
        try:
            c.get_or_fetch("bad", 60, boom, error_types=(Boom,), error_ttl=60)
        except Boom:
            pass
    assert len(calls) == 1  # failure cached, not re-fetched


def test_uncached_error_type_is_not_negative_cached():
    c = TTLCache()
    calls = []

    def boom():
        calls.append(1)
        raise Boom("transient")

    for _ in range(2):
        try:
            c.get_or_fetch("k", 60, boom)  # no error_types -> not cached
        except Boom:
            pass
    assert len(calls) == 2

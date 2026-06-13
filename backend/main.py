"""Compatibility shim.

The application lives in `app.main`. This re-export keeps `uvicorn main:app`
working; prefer `uvicorn app.main:app` going forward.
"""

from app.main import app

__all__ = ["app"]

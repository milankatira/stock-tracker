default: dev

.PHONY: dev ui install test lint

dev:
	.venv/bin/uvicorn app.main:app --reload

ui:
	PYTHONPATH=. .venv/bin/streamlit run frontend/app.py

install:
	uv pip install -e ".[dev,ui]"

test:
	.venv/bin/pytest -q

lint:
	.venv/bin/ruff check .

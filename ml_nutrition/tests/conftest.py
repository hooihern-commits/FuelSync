"""Test setup for the ML service.

Tests that touch the database need DATABASE_URL to point at a disposable
Postgres with the server migrations applied (cd server && npm run migrate).
Without it those tests are skipped and only the seed-only tests run.
"""
import os
import sys
from pathlib import Path

# Environment must be set before config.py is imported.
os.environ.setdefault("DATABASE_SSL", "false")
os.environ["MODEL_POLL_SECONDS"] = "3600"   # keep the background loop quiet
os.environ["MODEL_KEEP_VERSIONS"] = "2"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

HAS_DB = bool(os.environ.get("DATABASE_URL"))
needs_db = pytest.mark.skipif(not HAS_DB, reason="DATABASE_URL not set")

TABLES = (
    "ml_models, sync_state, daily_health_summary, health_samples, "
    "recovery_checkins, meals, suggestions, workouts, body_metrics, users"
)


@pytest.fixture()
def conn():
    """A connection to a freshly emptied test database."""
    import db

    c = db._connect()
    c.autocommit = True
    with c.cursor() as cur:
        cur.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
    yield c
    c.close()

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from typing import Dict, Iterator, Optional, Tuple

import pandas as pd
import psycopg2
import psycopg2.extras

from config import (
    DATABASE_SSLMODE, DATABASE_URL, MEALS, MODEL_KEEP_VERSIONS, MODEL_NAME,
)
from features import FEATURE_COLUMNS, TARGET, add_derived_columns


def _connect():
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it to the repo-root .env "
            "(same one the Node server uses)."
        )
    return psycopg2.connect(DATABASE_URL, sslmode=DATABASE_SSLMODE, connect_timeout=10)


# The meals macro columns differ between the committed migrations
# (name/calories/protein/carbs/fats/meal_time) and the running controller
# (meal_name/calories_kcal/protein_g/carbs_g/fat_g/logged_at). Rather than
# guess, detect the live column names at runtime; fall back to config on error.
def _detect_meal_cols(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = %s", (MEALS["table"],)
        )
        present = {r[0] for r in cur.fetchall()}

    def pick(candidates, default):
        for c in candidates:
            if c in present:
                return c
        return default

    return {
        "carbs": pick(["carbs_g", "carbs"], MEALS["carbs"]),
        "protein": pick(["protein_g", "protein"], MEALS["protein"]),
        "fats": pick(["fat_g", "fats"], MEALS["fats"]),
        "time": pick(["logged_at", "meal_time"], MEALS["time"]),
    }


def _training_sql(cols: dict) -> str:
    # One row per (workout, phase): the nutrition eaten against that phase's
    # advice, and the recovery score that followed. Grouping is by workout id,
    # so two workouts that happen to share the same stats stay two rows.
    #
    # Weight is the reading on or before the workout (what the user weighed
    # then), falling back to their earliest later reading.
    return f"""
SELECT
  w.id                                           AS workout_id,
  w.user_id,
  LOWER(COALESCE(w.actual_type, w.planned_type)) AS workout_type,
  s.phase                                        AS phase,
  LOWER(COALESCE(u.goal, 'maintain'))            AS goal,
  COALESCE(w.actual_rpe, w.planned_rpe)          AS rpe,
  w.duration_mins                                AS duration_mins,
  w.heart_rate_avg                               AS heart_rate_avg,
  w.calories_burned                              AS calories_burned,
  COALESCE(
    (SELECT bm.weight_kg FROM body_metrics bm
      WHERE bm.user_id = w.user_id
        AND bm.logged_at <= COALESCE(w.actual_end_time, w.planned_time)
      ORDER BY bm.logged_at DESC LIMIT 1),
    (SELECT bm.weight_kg FROM body_metrics bm
      WHERE bm.user_id = w.user_id
      ORDER BY bm.logged_at ASC LIMIT 1)
  )                                              AS weight,
  SUM(m.{cols['carbs']})                         AS carbs_g,
  SUM(m.{cols['protein']})                       AS protein_g,
  SUM(m.{cols['fats']})                          AS fat_g,
  rc.recovery_score                              AS recovery_score
FROM workouts w
JOIN users u              ON u.id = w.user_id
JOIN recovery_checkins rc ON rc.workout_id = w.id AND rc.user_id = w.user_id
JOIN suggestions s        ON s.workout_id = w.id
JOIN meals m              ON m.suggestion_id = s.id
GROUP BY w.id, s.phase, u.goal, rc.id
"""


def load_training_frame() -> pd.DataFrame:
    """Return a DataFrame shaped like FEATURE_COLUMNS + [TARGET].

    Returns an empty (correctly-typed) frame if the DB is unreachable or holds
    no labelled rows yet, so callers can transparently fall back to synthetic
    data during cold-start.
    """
    cols = FEATURE_COLUMNS + [TARGET]
    try:
        with _connect() as conn:
            meal_cols = _detect_meal_cols(conn)
            df = pd.read_sql(_training_sql(meal_cols), conn)
    except Exception as exc:  # noqa: BLE001 - cold-start is expected, not fatal
        print(f"[db] could not load training data ({exc}); returning empty frame")
        return pd.DataFrame(columns=cols)
    if len(df):
        df = add_derived_columns(df)
    return df.reindex(columns=cols)


def get_user_context(user_id: int) -> Dict:
    """Fetch the per-user attributes used as model context (weight, goal)."""
    try:
        with _connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """SELECT u.goal,
                              (SELECT bm.weight_kg FROM body_metrics bm
                               WHERE bm.user_id = u.id
                               ORDER BY bm.logged_at DESC LIMIT 1) AS weight
                       FROM users u WHERE u.id = %s""",
                    (user_id,),
                )
                row = cur.fetchone()
    except Exception as exc:  # noqa: BLE001
        print(f"[db] get_user_context failed ({exc})")
        return {}
    if not row:
        return {}
    return {"weight": row.get("weight"), "goal": (row.get("goal") or "maintain")}


def get_user_meal_profile(user_id: int, limit: int = 30) -> Optional[Dict]:
    """Average macros of the user's most recent meals.

    Used to keep recommendations grounded in what the user actually eats
    (personalization / 'reference previous meals'). Returns None if the user
    has no logged meals.
    """
    try:
        with _connect() as conn:
            c = _detect_meal_cols(conn)
            q = f"""
                SELECT AVG({c['carbs']}) AS carbs, AVG({c['protein']}) AS protein,
                       AVG({c['fats']}) AS fats, COUNT(*) AS n
                FROM (
                    SELECT {c['carbs']}, {c['protein']}, {c['fats']}
                    FROM {MEALS['table']}
                    WHERE user_id = %s
                    ORDER BY {c['time']} DESC
                    LIMIT %s
                ) recent
            """
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(q, (user_id, limit))
                row = cur.fetchone()
    except Exception as exc:  # noqa: BLE001
        print(f"[db] get_user_meal_profile failed ({exc})")
        return None
    if not row or not row.get("n"):
        return None
    return {
        "avg_carbs": float(row["carbs"] or 0),
        "avg_protein": float(row["protein"] or 0),
        "avg_fats": float(row["fats"] or 0),
        "n_meals": int(row["n"]),
    }


# --------------------------------------------------------------------------
# Model storage (ml_models table)
# --------------------------------------------------------------------------
@contextmanager
def _session():
    """A connection that commits on success and is always closed."""
    conn = _connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def save_model(artifact: bytes, metrics: Dict) -> int:
    """Store a trained model as a new version and prune old ones.

    Returns the new version id. Raises if the database is unreachable or the
    ml_models table is missing (server migration 005 not applied).
    """
    with _session() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ml_models (name, metrics, artifact) "
                "VALUES (%s, %s, %s) RETURNING id",
                (MODEL_NAME, psycopg2.extras.Json(metrics), psycopg2.Binary(artifact)),
            )
            model_id = cur.fetchone()[0]
            cur.execute(
                "DELETE FROM ml_models WHERE name = %s AND id NOT IN ("
                "  SELECT id FROM ml_models WHERE name = %s "
                "  ORDER BY created_at DESC, id DESC LIMIT %s)",
                (MODEL_NAME, MODEL_NAME, MODEL_KEEP_VERSIONS),
            )
    return model_id


def latest_model_meta() -> Optional[Tuple[int, datetime]]:
    """(id, created_at) of the newest stored model, or None if there is none.

    Raises if the database is unreachable, so callers can tell "no model yet"
    apart from "cannot reach the store".
    """
    with _session() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, created_at FROM ml_models WHERE name = %s "
                "ORDER BY created_at DESC, id DESC LIMIT 1",
                (MODEL_NAME,),
            )
            row = cur.fetchone()
    return (row[0], row[1]) if row else None


def load_latest_model() -> Optional[Tuple[int, bytes, Dict]]:
    """(id, artifact bytes, metrics) of the newest stored model, or None."""
    with _session() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, artifact, metrics FROM ml_models WHERE name = %s "
                "ORDER BY created_at DESC, id DESC LIMIT 1",
                (MODEL_NAME,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return row[0], bytes(row[1]), row[2] or {}


# Any constant works; it only has to be the same in every replica.
_RETRAIN_LOCK_KEY = 0x4655454C  # "FUEL"


@contextmanager
def retrain_lock() -> Iterator[bool]:
    """Hold a database-wide lock for the duration of a retrain.

    Yields True if this process got the lock, False if another replica holds
    it. The lock is transaction-scoped, so it also works through a connection
    pooler and is released if this process dies.
    """
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_xact_lock(%s)", (_RETRAIN_LOCK_KEY,))
            got = bool(cur.fetchone()[0])
        yield got
    finally:
        # Ending the transaction releases the lock. If the connection already
        # dropped, the lock went with it, so errors here are ignored.
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass

from __future__ import annotations

from typing import Dict, Optional

import pandas as pd
import psycopg2
import psycopg2.extras

from config import DATABASE_URL, MEALS
from features import FEATURE_COLUMNS, TARGET, add_derived_columns


def _connect():
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it to the repo-root .env "
            "(same one the Node server uses)."
        )
    return psycopg2.connect(DATABASE_URL, sslmode="require")


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
    return f"""
SELECT
  w.user_id,
  LOWER(COALESCE(w.actual_type, w.planned_type)) AS workout_type,
  s.phase                                        AS phase,
  LOWER(COALESCE(u.goal, 'maintain'))            AS goal,
  COALESCE(w.actual_rpe, w.planned_rpe)          AS rpe,
  w.duration_mins                                AS duration_mins,
  w.heart_rate_avg                               AS heart_rate_avg,
  w.calories_burned                              AS calories_burned,
  (SELECT bm.weight_kg FROM body_metrics bm
   WHERE bm.user_id = w.user_id
   ORDER BY bm.logged_at DESC LIMIT 1)           AS weight,
  SUM(m.{cols['carbs']})                         AS carbs_g,
  SUM(m.{cols['protein']})                       AS protein_g,
  SUM(m.{cols['fats']})                          AS fat_g,
  rc.recovery_score                              AS recovery_score
FROM workouts w
JOIN users u              ON u.id = w.user_id
JOIN recovery_checkins rc ON rc.workout_id = w.id
JOIN suggestions s        ON s.workout_id = w.id
JOIN meals m              ON m.suggestion_id = s.id
GROUP BY w.user_id, workout_type, s.phase, u.goal,
         rpe, w.duration_mins, w.heart_rate_avg, w.calories_burned,
         rc.recovery_score
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

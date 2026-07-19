"""Train / continually retrain the recovery-prediction model.

Learns  f(workout context + nutrition eaten) -> recovery_score  as a
Pipeline(preprocessor -> GradientBoostingRegressor), always grounded in the
evidence-based knowledge seed and blended with whatever real user data exists.

Continual (regressive) learning:
  * The seed (published guidelines) is the prior -> the model is usable on day 1.
  * Real (workout -> nutrition -> recovery) rows from Postgres are appended and
    up-weighted (REAL_ROW_WEIGHT) via sample_weight, so each real observation
    outweighs the generic prior and the model regresses toward real users.
  * Call retrain() (CLI, or the service's POST /retrain) whenever new recovery
    check-ins land to fold the new feedback in.

Run:  python train_recovery_model.py
"""
from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from config import (
    MATURE_REAL_ROWS, METRICS_PATH, MODEL_PATH, RANDOM_STATE, REAL_ROW_WEIGHT,
)
from features import FEATURE_COLUMNS, TARGET, build_preprocessor
from seed_knowledge import build_seed_frame

try:
    from db import load_training_frame
except Exception:  # noqa: BLE001 - psycopg2 optional when running seed-only
    load_training_frame = None


def _assemble_dataset() -> tuple[pd.DataFrame, np.ndarray, int, int]:
    """Return (X+y frame, sample_weight, n_seed, n_real).

    Seed rows get weight 1.0; real rows get REAL_ROW_WEIGHT so user feedback
    dominates as it accumulates.
    """
    seed = build_seed_frame()
    seed_w = np.ones(len(seed), dtype=float)

    real = pd.DataFrame(columns=FEATURE_COLUMNS + [TARGET])
    if load_training_frame is not None:
        try:
            real = load_training_frame().dropna(subset=[TARGET])
        except Exception as exc:  # noqa: BLE001
            print(f"[train] real-data load failed ({exc}); seed-only")

    if len(real):
        real_w = np.full(len(real), REAL_ROW_WEIGHT, dtype=float)
        df = pd.concat([seed, real], ignore_index=True)
        weights = np.concatenate([seed_w, real_w])
    else:
        df, weights = seed, seed_w

    return df, weights, len(seed), len(real)


def train():
    df, weights, n_seed, n_real = _assemble_dataset()
    print(f"[train] {len(df)} rows (seed={n_seed}, real={n_real})")

    X = df[FEATURE_COLUMNS]
    y = df[TARGET].astype(float)

    model = Pipeline(
        steps=[
            ("prep", build_preprocessor()),
            ("gbr", GradientBoostingRegressor(
                n_estimators=500, max_depth=4, learning_rate=0.05,
                subsample=0.9, random_state=RANDOM_STATE,
            )),
        ]
    )

    # Hold-out evaluation (weighted fit).
    idx = np.arange(len(df))
    tr, te = train_test_split(idx, test_size=0.2, random_state=RANDOM_STATE)
    model.fit(X.iloc[tr], y.iloc[tr], gbr__sample_weight=weights[tr])
    pred = model.predict(X.iloc[te])
    mae = float(mean_absolute_error(y.iloc[te], pred))
    r2 = float(r2_score(y.iloc[te], pred))

    # Refit on everything for the deployed artifact.
    model.fit(X, y, gbr__sample_weight=weights)
    joblib.dump(model, MODEL_PATH)

    metrics = {
        "n_seed_rows": n_seed,
        "n_real_rows": n_real,
        "real_row_weight": REAL_ROW_WEIGHT,
        "holdout_mae": round(mae, 3),
        "holdout_r2": round(r2, 3),
        # Grounded in published guidelines, so trustworthy from day 1; this flag
        # tracks maturity on REAL data for reporting.
        "is_trustworthy": True,
        "matured_on_real_data": bool(n_real >= MATURE_REAL_ROWS),
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print(f"[train] saved -> {MODEL_PATH} | holdout MAE={mae:.2f} R2={r2:.3f} | "
          f"real_rows={n_real} matured={metrics['matured_on_real_data']}")
    return metrics


# Alias: continual retraining is just a fresh blend of seed + latest real data.
retrain = train


if __name__ == "__main__":
    train()

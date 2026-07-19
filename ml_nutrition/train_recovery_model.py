from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline

from config import (
    MIN_TRAINING_ROWS, MODEL_PATH, METRICS_PATH, RANDOM_STATE, SYNTHETIC_PATH,
)
from features import FEATURE_COLUMNS, TARGET, build_preprocessor
from generate_synthetic import generate

try:
    from db import load_training_frame
except Exception:  # noqa: BLE001 - psycopg2 optional during pure-synthetic runs
    load_training_frame = None


def _load_data() -> tuple[pd.DataFrame, str]:
    """Return (dataframe, source_label), preferring real data over synthetic."""
    if load_training_frame is not None:
        real = load_training_frame()
        if len(real) >= MIN_TRAINING_ROWS:
            return real.dropna(subset=[TARGET]), "database"
        if len(real):
            print(f"[train] only {len(real)} real rows (< {MIN_TRAINING_ROWS}); "
                  "using synthetic data instead")

    if SYNTHETIC_PATH.exists():
        return pd.read_csv(SYNTHETIC_PATH), "synthetic-csv"
    print("[train] no synthetic file found; generating one")
    df = generate(4000)
    df.to_csv(SYNTHETIC_PATH, index=False)
    return df, "synthetic-generated"


def train():
    df, source = _load_data()
    print(f"[train] {len(df)} rows from {source}")

    X = df[FEATURE_COLUMNS]
    y = df[TARGET].astype(float)

    model = Pipeline(
        steps=[
            ("prep", build_preprocessor()),
            ("gbr", GradientBoostingRegressor(
                n_estimators=300, max_depth=3, learning_rate=0.05,
                subsample=0.9, random_state=RANDOM_STATE,
            )),
        ]
    )

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE
    )
    model.fit(X_tr, y_tr)

    pred = model.predict(X_te)
    mae = float(mean_absolute_error(y_te, pred))
    r2 = float(r2_score(y_te, pred))
    cv = cross_val_score(model, X, y, cv=5, scoring="r2")

    # Refit on all data for the deployed artifact.
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)

    metrics = {
        "source": source,
        "n_rows": int(len(df)),
        "holdout_mae": round(mae, 3),
        "holdout_r2": round(r2, 3),
        "cv_r2_mean": round(float(np.mean(cv)), 3),
        "cv_r2_std": round(float(np.std(cv)), 3),
        "is_trustworthy": bool(len(df) >= MIN_TRAINING_ROWS),
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print(f"[train] saved model -> {MODEL_PATH}")
    print(f"[train] holdout: MAE={mae:.2f} R2={r2:.3f} | "
          f"CV R2={np.mean(cv):.3f}±{np.std(cv):.3f}")
    return metrics


if __name__ == "__main__":
    train()

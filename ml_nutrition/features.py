"""Feature schema shared by training, optimization, and serving.

Keeping the column layout and the preprocessing pipeline in one place is what
guarantees the model sees identically-shaped rows at train time and at
inference time. `train_recovery_model` fits a Pipeline(preprocessor -> model)
and saves the whole thing, so `optimize`/`serve` only ever build a DataFrame
with these columns and call `.predict`.
"""
from __future__ import annotations

from typing import Dict

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from config import KCAL_PER_G

# Context = the workout / user situation the recommendation is conditioned on.
# These are FIXED at recommendation time.
CONTEXT_CATEGORICAL = ["workout_type", "phase", "goal"]
CONTEXT_NUMERIC = ["rpe", "duration_mins", "heart_rate_avg", "calories_burned", "weight"]

# Nutrition = the actionable decision variables the optimizer searches over.
NUTRITION = ["carbs_g", "protein_g", "fat_g"]

# Derived domain features. Fuelling guidelines are expressed per-kg bodyweight,
# so macros/kg make the recovery optimum nearly context-independent (far easier
# for the model to locate than absolute grams). intensity_volume proxies how
# glycogen-depleting the session was (drives carb need).
DERIVED = ["carbs_per_kg", "protein_per_kg", "fat_per_kg", "intensity_volume"]

# Full ordered feature list the model consumes.
FEATURE_COLUMNS = CONTEXT_CATEGORICAL + CONTEXT_NUMERIC + NUTRITION + DERIVED
TARGET = "recovery_score"

_DEFAULT_WEIGHT = 70.0


def calories_from_macros(carbs_g: float, protein_g: float, fat_g: float) -> float:
    """Derive kcal from grams using Atwater factors."""
    return (
        carbs_g * KCAL_PER_G["carbs"]
        + protein_g * KCAL_PER_G["protein"]
        + fat_g * KCAL_PER_G["fats"]
    )


def _derive(weight, rpe, duration_mins, carbs_g, protein_g, fat_g) -> Dict:
    w = weight or _DEFAULT_WEIGHT
    return {
        "carbs_per_kg": carbs_g / w,
        "protein_per_kg": protein_g / w,
        "fat_per_kg": fat_g / w,
        "intensity_volume": ((rpe or 5) * (duration_mins or 45)) / 100.0,
    }


def make_row(context: Dict, carbs_g: float, protein_g: float, fat_g: float) -> Dict:
    """Assemble a single feature-row dict from a context + a macro triple.

    `context` supplies the CONTEXT_* fields (missing numerics may be None and
    are imputed downstream; missing categoricals default sensibly).
    """
    row = {
        "workout_type": (context.get("workout_type") or "other").lower(),
        "phase": context.get("phase") or "post",
        "goal": (context.get("goal") or "maintain").lower(),
        "rpe": context.get("rpe"),
        "duration_mins": context.get("duration_mins"),
        "heart_rate_avg": context.get("heart_rate_avg"),
        "calories_burned": context.get("calories_burned"),
        "weight": context.get("weight"),
        "carbs_g": carbs_g,
        "protein_g": protein_g,
        "fat_g": fat_g,
    }
    row.update(_derive(row["weight"], row["rpe"], row["duration_mins"],
                       carbs_g, protein_g, fat_g))
    return row


def add_derived_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Vectorized version of `_derive` for a whole DataFrame (seed / real data)."""
    w = df["weight"].fillna(_DEFAULT_WEIGHT).replace(0, _DEFAULT_WEIGHT)
    df = df.copy()
    df["carbs_per_kg"] = df["carbs_g"] / w
    df["protein_per_kg"] = df["protein_g"] / w
    df["fat_per_kg"] = df["fat_g"] / w
    df["intensity_volume"] = (
        df["rpe"].fillna(5) * df["duration_mins"].fillna(45)
    ) / 100.0
    return df


def to_frame(rows) -> pd.DataFrame:
    """Coerce a dict or list-of-dicts into a DataFrame with the right columns."""
    if isinstance(rows, dict):
        rows = [rows]
    return pd.DataFrame(rows, columns=FEATURE_COLUMNS)


def build_preprocessor() -> ColumnTransformer:
    """Column transformer: one-hot the categoricals, impute+scale the numerics."""
    categorical = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    numeric = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("cat", categorical, CONTEXT_CATEGORICAL),
            ("num", numeric, CONTEXT_NUMERIC + NUTRITION + DERIVED),
        ]
    )

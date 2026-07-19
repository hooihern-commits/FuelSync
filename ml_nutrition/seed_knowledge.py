"""Evidence-based knowledge seed (replaces random synthetic data).

Instead of fabricating data from arbitrary coefficients, this encodes published
sports-nutrition guidelines as a deterministic training table:

  * Post-workout carbohydrate up to ~1.0-1.2 g/kg for glycogen-depleting
    sessions, scaled down for lighter ones (glycogen-resynthesis literature).
  * Protein ~0.25-0.35 g/kg per serving (ISSN protein position stand).
  * Fat ~0.25 g/kg, kept lower pre-workout (ISSN nutrient-timing stand).

For each realistic workout context we compute the guideline "ideal" macros,
then emit rows at a deterministic grid of intake deviations around that ideal,
labelling each with a physiologically-motivated recovery score that peaks at
the ideal and falls off as intake diverges (carbohydrate weighted most, since
it drives glycogen repletion). The regression learns this response surface;
the optimizer then recovers the guideline-optimal macros. As real user data
arrives it is blended in and up-weighted (see train_recovery_model.py), so the
model continually regresses toward this app's actual users.

Sources:
  - ISSN Position Stand: Protein and Exercise (PMC5477153)
  - ISSN Position Stand: Nutrient Timing (PMC5596471)
  - Postexercise muscle glycogen resynthesis in humans (J Appl Physiol, 2017)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from config import GUIDELINES
from features import FEATURE_COLUMNS, TARGET, add_derived_columns

WORKOUT_TYPES = [
    "running", "cycling", "hiit", "swimming", "weights",
    "football", "basketball", "yoga", "walking", "other",
]


def _glycogen_depletion(rpe: float, duration_mins: float) -> float:
    """0-1 estimate of how glycogen-depleting a session was.

    Rises with both intensity (RPE) and duration; a hard, long session
    approaches full depletion (-> top of the carb g/kg range).
    """
    return float(np.clip((rpe / 10.0) * (duration_mins / 90.0), 0.05, 1.0))


def ideal_macros(weight, rpe, duration_mins, phase) -> tuple[float, float, float]:
    """Guideline-optimal macros (grams) for a workout context.

    Interpolates within the published g/kg ranges by session demand.
    """
    g = GUIDELINES[phase]
    weight = weight or 70.0
    depletion = _glycogen_depletion(rpe, duration_mins)

    carbs = weight * (
        g["carbs_min_gkg"] + (g["carbs_max_gkg"] - g["carbs_min_gkg"]) * depletion
    )
    protein = weight * (
        g["protein_min_gkg"] + (g["protein_max_gkg"] - g["protein_min_gkg"]) * (rpe / 10.0)
    )
    fats = weight * g["fat_gkg"] * (0.6 + 0.4 * (1.0 - depletion))
    return float(carbs), float(protein), float(fats)


def _recovery(rpe, duration_mins, goal, carbs, protein, fats, ideal) -> float:
    """Physiologically-motivated recovery score (0-100).

    Peaks when intake matches the guideline ideal; penalises deviation, with
    carbohydrate weighted most (glycogen), then protein, then fat. Under-fuelling
    is penalised slightly more than over-fuelling.
    """
    ic, ip, iff = ideal

    def rel(x, ideal_x, under_mult):
        dev = abs(x - ideal_x) / max(ideal_x, 1.0)
        return dev * (under_mult if x < ideal_x else 1.0)

    carb_pen = 25.0 * rel(carbs, ic, 1.25) ** 1.25
    prot_pen = 12.0 * rel(protein, ip, 1.15) ** 1.2
    fat_pen = 5.0 * rel(fats, iff, 1.0) ** 1.2

    # A harder / longer session lowers the achievable recovery ceiling even with
    # perfect fuelling; goal nudges it slightly.
    base = 96.0 - 2.0 * (rpe - 5) - 0.04 * duration_mins
    goal_adj = {"lose": -2.0, "maintain": 0.0, "gain": 1.0}.get(goal, 0.0)

    return float(np.clip(base + goal_adj - carb_pen - prot_pen - fat_pen, 20.0, 100.0))


# Deterministic grids — no randomness, so the seed is reproducible knowledge.
_WEIGHTS = [60, 75, 90]
_RPES = [2, 4, 6, 8, 10]
_DURATIONS = [30, 60, 100]
_PHASES = ["pre", "post"]
_GOALS = ["lose", "maintain", "gain"]
_CARB_DEV = [0.5, 0.75, 1.0, 1.25, 1.5]
_PROT_DEV = [0.6, 0.8, 1.0, 1.2, 1.4]
_FAT_DEV = [0.7, 1.0, 1.3]


def build_seed_frame() -> pd.DataFrame:
    """Materialize the evidence-based seed as a DataFrame."""
    rows = []
    for i, weight in enumerate(_WEIGHTS):
        for rpe in _RPES:
            for duration in _DURATIONS:
                # Deterministic physiological estimates for the extra features.
                hr = int(90 + 8 * rpe)
                burn = float(duration * (4.0 + 0.9 * rpe))
                for phase in _PHASES:
                    for goal in _GOALS:
                        ideal = ideal_macros(weight, rpe, duration, phase)
                        ic, ip, iff = ideal
                        wtype = WORKOUT_TYPES[(i + rpe + duration) % len(WORKOUT_TYPES)]
                        for cd in _CARB_DEV:
                            for pd_ in _PROT_DEV:
                                for fd in _FAT_DEV:
                                    carbs, protein, fats = ic * cd, ip * pd_, iff * fd
                                    rows.append({
                                        "workout_type": wtype,
                                        "phase": phase,
                                        "goal": goal,
                                        "rpe": rpe,
                                        "duration_mins": duration,
                                        "heart_rate_avg": hr,
                                        "calories_burned": burn,
                                        "weight": weight,
                                        "carbs_g": carbs,
                                        "protein_g": protein,
                                        "fat_g": fats,
                                        TARGET: _recovery(
                                            rpe, duration, goal, carbs, protein, fats, ideal
                                        ),
                                    })
    df = pd.DataFrame(rows)
    df = add_derived_columns(df)
    return df.reindex(columns=FEATURE_COLUMNS + [TARGET])


if __name__ == "__main__":
    from config import SEED_PATH
    df = build_seed_frame()
    df.to_csv(SEED_PATH, index=False)
    print(f"Built evidence-based seed: {len(df)} rows -> {SEED_PATH}")
    print(df[[TARGET]].describe().round(2).to_string())

"""Turn the recovery model into a recommendation.

The model predicts recovery from (fixed context + nutrition). To recommend, we
hold the context fixed and search the macro space for the grams that maximize
predicted recovery.

The search is *anchored to the evidence-based guideline ideal* (see
seed_knowledge.ideal_macros) and only explores a band around it. This keeps the
search inside the region the model was actually trained on (avoiding unreliable
extrapolation) and keeps recommendations physiologically sane, while still
letting the model — as it learns from real user data — and the user's own
intake shift the answer within that band. Constraints applied:
  * band around the guideline ideal (BAND_LO..BAND_HI x ideal),
  * hard per-phase macro bounds (config.MACRO_BOUNDS),
  * a calorie ceiling from the user's goal (config.GOAL_CALORIE_CAP),
  * a light personalization pull toward the user's typical intake.
"""
from __future__ import annotations

from typing import Dict, Optional

import numpy as np

from config import DEFAULT_CALORIE_CAP, GOAL_CALORIE_CAP, MACRO_BOUNDS
from features import calories_from_macros, make_row, to_frame
from seed_knowledge import ideal_macros

# How far around the guideline ideal the optimizer may roam.
BAND_LO, BAND_HI = 0.5, 1.6
# Grid resolution per macro (carbs, protein, fats).
_GRID = (21, 13, 7)
# Personalization strength (recovery points penalised per gram of average
# absolute deviation from the user's usual macros). Small: breaks ties only.
_PERSONALIZATION_WEIGHT = 0.02


def _axis(ideal_val, bounds, n):
    lo = max(ideal_val * BAND_LO, bounds[0])
    hi = min(ideal_val * BAND_HI, bounds[1])
    if hi <= lo:
        hi = lo + 1.0
    return np.linspace(lo, hi, n)


def _candidate_grid(context, phase):
    """Fine grid of (carbs, protein, fats) around the guideline ideal."""
    b = MACRO_BOUNDS.get(phase, MACRO_BOUNDS["post"])
    ic, ip, iff = ideal_macros(
        context.get("weight"), context.get("rpe") or 5,
        context.get("duration_mins") or 45, phase,
    )
    carbs = _axis(ic, b["carbs"], _GRID[0])
    protein = _axis(ip, b["protein"], _GRID[1])
    fats = _axis(iff, b["fats"], _GRID[2])
    grid = np.array(np.meshgrid(carbs, protein, fats)).T.reshape(-1, 3)
    return grid


def _text(phase: str, carbs, protein, fats, score) -> str:
    window = "2-3 hrs before your session" if phase == "pre" else "within 45 mins of finishing"
    return (
        f"Aim for ~{round(carbs)}g carbs, {round(protein)}g protein and "
        f"{round(fats)}g fat {window}. Personalized target "
        f"(predicted recovery {round(score)}/100)."
    )


def recommend(
    model,
    context: Dict,
    phase: str,
    meal_profile: Optional[Dict] = None,
) -> Dict:
    """Return the recovery-maximizing macro recommendation for a context."""
    cap = GOAL_CALORIE_CAP.get((context.get("goal") or "maintain").lower(), DEFAULT_CALORIE_CAP)
    cand = _candidate_grid(context, phase)

    # Respect the calorie ceiling (keep all if none qualify).
    kcal = cand @ np.array([4.0, 4.0, 9.0])
    keep = kcal <= cap
    if keep.any():
        cand = cand[keep]

    rows = [make_row({**context, "phase": phase}, c, p, f) for c, p, f in cand]
    scores = model.predict(to_frame(rows))

    # Light personalization: nudge toward the user's usual macros.
    if meal_profile:
        usual = np.array([
            meal_profile.get("avg_carbs", 0),
            meal_profile.get("avg_protein", 0),
            meal_profile.get("avg_fats", 0),
        ])
        scores = scores - _PERSONALIZATION_WEIGHT * np.abs(cand - usual).mean(axis=1)

    best = int(np.argmax(scores))
    carbs, protein, fats = (float(x) for x in cand[best])
    predicted = float(model.predict(to_frame([
        make_row({**context, "phase": phase}, carbs, protein, fats)
    ]))[0])

    return {
        "text": _text(phase, carbs, protein, fats, predicted),
        "suggested_carbs": round(carbs, 1),
        "suggested_protein": round(protein, 1),
        "suggested_fats": round(fats, 1),
        "suggested_calories": round(calories_from_macros(carbs, protein, fats), 1),
        "predicted_recovery": round(predicted, 1),
        "personalized": bool(meal_profile),
    }

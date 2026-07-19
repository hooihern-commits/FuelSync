"""Rule-based cold-start advice.

Mirrors server/controllers/suggestionController.js so the ML service can return
something sensible before enough real data exists to trust the model. The Node
side ALSO has this logic, so recommendations degrade gracefully whether the
service is cold, down, or unreachable.
"""
from __future__ import annotations

from typing import Dict

CARDIO_TYPES = {
    "running", "cycling", "hiit", "swimming",
    "football", "basketball", "badminton", "tennis", "other",
}


def pre_advice(workout_type: str, rpe) -> Dict:
    rpe = rpe or 5
    intense = rpe >= 6
    cardio = (workout_type or "other").lower() in CARDIO_TYPES
    if intense and cardio:
        return {
            "text": "High-intensity cardio ahead. Eat 60-80g carbs + 20-25g protein "
                    "2-3 hrs before. Keep fat low.",
            "suggested_carbs": 70, "suggested_protein": 22, "suggested_fats": 8,
            "suggested_calories": 450,
        }
    if intense:
        return {
            "text": "Heavy session planned. Have 50-60g carbs + 25-30g protein "
                    "1.5-2 hrs before.",
            "suggested_carbs": 55, "suggested_protein": 28, "suggested_fats": 8,
            "suggested_calories": 400,
        }
    return {
        "text": "Light session ahead. A small snack works: 30g carbs + 15g protein, "
                "1 hr before.",
        "suggested_carbs": 30, "suggested_protein": 15, "suggested_fats": 5,
        "suggested_calories": 220,
    }


def post_advice(rpe, duration_mins) -> Dict:
    rpe = rpe or 5
    duration_mins = duration_mins or 0
    intense = rpe >= 6 or duration_mins >= 60
    if intense:
        return {
            "text": "Hard effort! Recover with 40-50g protein + 80-100g carbs within "
                    "45 mins. Rehydrate.",
            "suggested_carbs": 90, "suggested_protein": 45, "suggested_fats": 12,
            "suggested_calories": 600,
        }
    return {
        "text": "Good work. A moderate recovery meal works: 25-30g protein + 50g carbs.",
        "suggested_carbs": 50, "suggested_protein": 28, "suggested_fats": 8,
        "suggested_calories": 350,
    }


def advice(phase: str, context: Dict) -> Dict:
    """Dispatch to the right rule set for a phase."""
    if phase == "pre":
        return pre_advice(context.get("workout_type"), context.get("rpe"))
    return post_advice(context.get("rpe"), context.get("duration_mins"))

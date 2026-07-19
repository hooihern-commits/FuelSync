"""FastAPI inference service for FuelSync nutrition recommendations.

The Node/Express backend POSTs a workout context here and gets back a macro
recommendation. If the model is missing the service returns the rule-based
fallback and flags `source: "rule"`. A POST /retrain endpoint re-blends the
evidence-based seed with the latest real data (continual learning), triggered
by Node after each recovery check-in.

Run:  uvicorn serve:app --host 127.0.0.1 --port 8000
  or: python serve.py
"""
from __future__ import annotations

import json
import threading
from typing import Optional

import joblib
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel, Field

import fallback
from config import METRICS_PATH, MODEL_PATH, SERVICE_HOST, SERVICE_PORT
from optimize import recommend
from train_recovery_model import retrain

app = FastAPI(title="FuelSync ML Nutrition", version="1.0.0")

_STATE = {"model": None, "metrics": {}, "trustworthy": False}
_retrain_lock = threading.Lock()


def _load_model() -> None:
    if MODEL_PATH.exists():
        _STATE["model"] = joblib.load(MODEL_PATH)
    if METRICS_PATH.exists():
        _STATE["metrics"] = json.loads(METRICS_PATH.read_text())
    # Trustworthy whenever a model exists: it is grounded in the evidence-based
    # knowledge seed even before any real user data has been folded in.
    _STATE["trustworthy"] = _STATE["model"] is not None
    print(f"[serve] model loaded={_STATE['model'] is not None} "
          f"trustworthy={_STATE['trustworthy']} "
          f"real_rows={_STATE['metrics'].get('n_real_rows')}")


def _retrain_and_reload() -> None:
    """Continual-learning step: re-blend seed + latest real data, then reload."""
    if not _retrain_lock.acquire(blocking=False):
        print("[serve] retrain already in progress; skipping")
        return
    try:
        retrain()
        _load_model()
    finally:
        _retrain_lock.release()


@app.on_event("startup")
def _startup() -> None:
    # Ensure a model exists on first boot by training from the knowledge seed.
    if not MODEL_PATH.exists():
        print("[serve] no model artifact; training from evidence-based seed")
        retrain()
    _load_model()


class RecommendRequest(BaseModel):
    phase: str = Field(..., pattern="^(pre|post)$")
    workout_type: Optional[str] = None
    rpe: Optional[float] = None
    duration_mins: Optional[float] = None
    heart_rate_avg: Optional[float] = None
    calories_burned: Optional[float] = None
    # User context (Node passes these from the users table; optional).
    weight: Optional[float] = None
    goal: Optional[str] = None
    # Optional recent-meal profile for personalization.
    avg_carbs: Optional[float] = None
    avg_protein: Optional[float] = None
    avg_fats: Optional[float] = None
    n_meals: Optional[int] = None


class RecommendResponse(BaseModel):
    source: str  # "ml" or "rule"
    phase: str
    text: str
    suggested_carbs: float
    suggested_protein: float
    suggested_fats: float
    suggested_calories: float
    predicted_recovery: Optional[float] = None
    personalized: bool = False


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": _STATE["model"] is not None,
        "trustworthy": _STATE["trustworthy"],
        "metrics": _STATE["metrics"],
    }


@app.post("/reload")
def reload_model():
    """Reload the artifact after a retrain without restarting the process."""
    _load_model()
    return {"reloaded": True, "trustworthy": _STATE["trustworthy"]}


@app.post("/retrain")
def retrain_endpoint(background_tasks: BackgroundTasks):
    """Trigger a continual-learning retrain (seed + latest real data).

    Runs in the background so callers (e.g. the Node server after a recovery
    check-in) return immediately. Concurrent triggers are coalesced by a lock.
    """
    background_tasks.add_task(_retrain_and_reload)
    return {"scheduled": True}


@app.post("/recommend", response_model=RecommendResponse)
def recommend_endpoint(req: RecommendRequest):
    context = {
        "workout_type": req.workout_type,
        "rpe": req.rpe,
        "duration_mins": req.duration_mins,
        "heart_rate_avg": req.heart_rate_avg,
        "calories_burned": req.calories_burned,
        "weight": req.weight,
        "goal": req.goal,
    }

    # Cold-start / no-model -> rule-based advice.
    if not _STATE["trustworthy"]:
        adv = fallback.advice(req.phase, context)
        return RecommendResponse(source="rule", phase=req.phase, personalized=False, **adv)

    meal_profile = None
    if req.n_meals:
        meal_profile = {
            "avg_carbs": req.avg_carbs or 0,
            "avg_protein": req.avg_protein or 0,
            "avg_fats": req.avg_fats or 0,
            "n_meals": req.n_meals,
        }

    rec = recommend(_STATE["model"], context, req.phase, meal_profile)
    return RecommendResponse(source="ml", phase=req.phase, **rec)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=SERVICE_HOST, port=SERVICE_PORT)

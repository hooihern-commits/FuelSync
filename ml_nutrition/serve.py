"""FastAPI inference service for FuelSync nutrition recommendations.

The Node/Express backend POSTs a workout context here and gets back a macro
recommendation. If no model is loaded the service returns the rule-based
fallback and flags `source: "rule"`.

Models and retraining:
  * Trained models live in the ml_models table. On boot, and every few
    minutes after, the service loads the newest stored version. A retrained
    model therefore survives a redeploy, and all replicas serve the same one.
  * Retraining runs on a schedule (RETRAIN_INTERVAL_HOURS, default 24), in a
    separate process, so it never competes with /recommend for the CPU. A
    database lock makes sure only one replica trains at a time.
  * POST /retrain forces a retrain now.

Run:  uvicorn serve:app --host 127.0.0.1 --port 8000
  or: python serve.py
"""
from __future__ import annotations

import io
import json
import subprocess
import sys
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

import joblib
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel, Field

import fallback
from config import (
    DATABASE_URL, METRICS_PATH, MODEL_PATH, MODEL_POLL_SECONDS, PKG_DIR,
    RETRAIN_INTERVAL_HOURS, RETRAIN_TIMEOUT_SECONDS, SERVICE_HOST, SERVICE_PORT,
)
from optimize import recommend

try:
    import db
except Exception:  # noqa: BLE001 - psycopg2 optional when running seed-only
    db = None
if not DATABASE_URL:
    # No database configured (local seed-only use): serve from disk only.
    db = None

app = FastAPI(title="FuelSync ML Nutrition", version="1.1.0")

# model_id is the ml_models version being served, or None when the model came
# from local disk (no database, or nothing stored yet).
_STATE = {"model": None, "metrics": {}, "trustworthy": False, "model_id": None}
_retrain_lock = threading.Lock()
_stop = threading.Event()


def _set_model(model, metrics: dict, model_id: Optional[int]) -> None:
    _STATE["model"] = model
    _STATE["metrics"] = metrics
    _STATE["model_id"] = model_id
    # Trustworthy whenever a model exists: it is grounded in the evidence-based
    # knowledge seed even before any real user data has been folded in.
    _STATE["trustworthy"] = model is not None
    print(f"[serve] model loaded={model is not None} version={model_id} "
          f"real_rows={metrics.get('n_real_rows')}")


def _load_from_store() -> bool:
    """Load the newest model from ml_models. False if there is none to load."""
    if db is None:
        return False
    try:
        stored = db.load_latest_model()
    except Exception as exc:  # noqa: BLE001 - store unreachable, use disk
        print(f"[serve] model store unavailable ({exc})")
        return False
    if stored is None:
        return False
    model_id, artifact, metrics = stored
    try:
        model = joblib.load(io.BytesIO(artifact))
    except Exception as exc:  # noqa: BLE001 - e.g. trained on another sklearn
        print(f"[serve] stored model {model_id} could not be loaded ({exc})")
        return False
    _set_model(model, metrics, model_id)
    return True


def _load_from_disk() -> bool:
    if not MODEL_PATH.exists():
        return False
    metrics = json.loads(METRICS_PATH.read_text()) if METRICS_PATH.exists() else {}
    _set_model(joblib.load(MODEL_PATH), metrics, None)
    return True


def _load_model() -> None:
    """Newest stored model if there is one, else the copy on local disk."""
    if not _load_from_store():
        _load_from_disk()


def _train_in_subprocess() -> bool:
    """Run the trainer as its own process. True if it finished cleanly."""
    try:
        result = subprocess.run(
            [sys.executable, "train_recovery_model.py"],
            cwd=PKG_DIR, timeout=RETRAIN_TIMEOUT_SECONDS,
            capture_output=True, text=True, check=False,
        )
    except subprocess.TimeoutExpired:
        print(f"[serve] retrain timed out after {RETRAIN_TIMEOUT_SECONDS}s")
        return False
    if result.stdout:
        print(result.stdout.rstrip())
    if result.returncode != 0:
        print(f"[serve] retrain failed (exit {result.returncode}): {result.stderr[-2000:]}")
        return False
    return True


def _retrain_due() -> bool:
    """True if the newest stored model is older than the retrain interval."""
    latest = db.latest_model_meta()
    if latest is None:
        return True  # nothing stored yet: publish a first version
    age = datetime.now(timezone.utc) - latest[1]
    return age >= timedelta(hours=RETRAIN_INTERVAL_HOURS)


def _retrain_and_reload(force: bool = False) -> None:
    """Retrain (seed + latest real data) in a subprocess, then load the result.

    Scheduled calls (force=False) only train when the stored model is due.
    Only one replica trains at a time; the others pick the new version up on
    their next poll.
    """
    if not _retrain_lock.acquire(blocking=False):
        print("[serve] retrain already in progress; skipping")
        return
    try:
        if db is None:
            # No database driver: train on the seed and use the disk copy.
            if force and _train_in_subprocess():
                _load_from_disk()
            return
        try:
            with db.retrain_lock() as got_lock:
                if not got_lock:
                    print("[serve] another replica is retraining; skipping")
                    return
                if not force and not _retrain_due():
                    return
                trained = _train_in_subprocess()
        except Exception as exc:  # noqa: BLE001 - database unreachable
            if not force:
                # Nothing new to learn from without the database.
                print(f"[serve] scheduled retrain skipped, database unavailable ({exc})")
                return
            trained = _train_in_subprocess()
        if trained:
            _load_model()
    finally:
        _retrain_lock.release()


def _refresh_if_newer() -> None:
    """Load the stored model if it is not the version being served."""
    if db is None:
        return
    try:
        latest = db.latest_model_meta()
    except Exception:  # noqa: BLE001 - try again next poll
        return
    if latest is not None and latest[0] != _STATE["model_id"]:
        _load_from_store()


def _maintenance_loop() -> None:
    """Background thread: pick up newer models, and retrain when one is due."""
    while not _stop.wait(MODEL_POLL_SECONDS):
        try:
            _refresh_if_newer()
            if RETRAIN_INTERVAL_HOURS > 0:
                _retrain_and_reload(force=False)
        except Exception as exc:  # noqa: BLE001 - keep the loop alive
            print(f"[serve] maintenance loop error ({exc})")


@app.on_event("startup")
def _startup() -> None:
    _load_model()
    if _STATE["model"] is None:
        # No stored model and none on disk: train from the knowledge seed.
        print("[serve] no model artifact; training from evidence-based seed")
        if _train_in_subprocess():
            _load_model()
    threading.Thread(target=_maintenance_loop, name="model-maintenance", daemon=True).start()


@app.on_event("shutdown")
def _shutdown() -> None:
    _stop.set()


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
        "model_version": _STATE["model_id"],
        "trustworthy": _STATE["trustworthy"],
        "metrics": _STATE["metrics"],
    }


@app.post("/reload")
def reload_model():
    """Load the newest stored model now, without waiting for the next poll."""
    _load_model()
    return {
        "reloaded": True,
        "model_version": _STATE["model_id"],
        "trustworthy": _STATE["trustworthy"],
    }


@app.post("/retrain")
def retrain_endpoint(background_tasks: BackgroundTasks):
    """Force a retrain now (seed + latest real data).

    Returns immediately; training runs in a separate process. Scheduled
    retraining covers normal use, so this is for operators and deploy hooks.
    """
    background_tasks.add_task(_retrain_and_reload, True)
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

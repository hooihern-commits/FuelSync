"""Central configuration for the FuelSync ML nutrition service.

Everything environment-specific (DB connection, column names, file paths,
model hyper-parameters, macro bounds) lives here so the rest of the package
never hard-codes a schema detail.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# The Node server keeps its .env in server/ (that's where DATABASE_URL lives),
# so load that first; fall back to a repo-root .env if one exists. load_dotenv
# does not override already-set vars, so the first file to define a key wins.
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "server" / ".env")
load_dotenv(ROOT / ".env")

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------
PKG_DIR = Path(__file__).resolve().parent
MODEL_DIR = PKG_DIR / "model"
DATA_DIR = PKG_DIR / "data"
MODEL_PATH = MODEL_DIR / "recovery_model.joblib"
METRICS_PATH = MODEL_DIR / "metrics.json"
SEED_PATH = DATA_DIR / "seed_knowledge.csv"

MODEL_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")

# NOTE: the committed migrations (001/002) define the meals table with the
# columns on the RIGHT, but server/controllers/mealController.js writes the
# columns on the LEFT. The running DB matches whatever mealController.js uses,
# so we default to those names. If your live schema uses the migration names,
# flip USE_MIGRATION_MEAL_SCHEMA to True (or edit MEALS below).
USE_MIGRATION_MEAL_SCHEMA = os.getenv("USE_MIGRATION_MEAL_SCHEMA", "false").lower() == "true"

if USE_MIGRATION_MEAL_SCHEMA:
    MEALS = {
        "table": "meals",
        "calories": "calories",
        "protein": "protein",
        "carbs": "carbs",
        "fats": "fats",
        "time": "meal_time",
    }
else:
    MEALS = {
        "table": "meals",
        "calories": "calories_kcal",
        "protein": "protein_g",
        "carbs": "carbs_g",
        "fats": "fat_g",
        "time": "logged_at",
    }

# --------------------------------------------------------------------------
# Macro / nutrition domain constants
# --------------------------------------------------------------------------
# Calories per gram of each macronutrient (Atwater factors).
KCAL_PER_G = {"carbs": 4.0, "protein": 4.0, "fats": 9.0}

# Evidence-based fuelling guidelines used to build the knowledge seed
# (grams per kg of bodyweight). Sourced from the ISSN position stands on
# protein & nutrient timing and glycogen-resynthesis literature:
#   - Protein: 0.25-0.3 g/kg per serving (ISSN protein position stand)
#   - Post-workout carbs: up to ~1.0-1.2 g/kg for glycogen-depleting sessions
#   - Pre-workout carbs: ~0.3-1.0 g/kg for a meal/snack close to training
#   - Fat: modest per-session target, kept lower pre-workout
# These anchor the seed; the model then adapts to real users via retraining.
GUIDELINES = {
    "post": {
        "carbs_min_gkg": 0.4, "carbs_max_gkg": 1.2,   # scales with depletion
        "protein_min_gkg": 0.25, "protein_max_gkg": 0.35,
        "fat_gkg": 0.25,
    },
    "pre": {
        "carbs_min_gkg": 0.3, "carbs_max_gkg": 1.0,
        "protein_min_gkg": 0.15, "protein_max_gkg": 0.25,
        "fat_gkg": 0.12,   # kept low pre-workout
    },
}

# Search bounds (grams) the optimizer explores per phase. Kept deliberately
# wide; the model + user goal narrow them down.
MACRO_BOUNDS = {
    "pre": {"carbs": (15, 120), "protein": (10, 45), "fats": (0, 20)},
    "post": {"carbs": (20, 140), "protein": (20, 60), "fats": (0, 30)},
}

# Calorie ceilings applied on top of the model, keyed by the user's `goal`.
GOAL_CALORIE_CAP = {
    "lose": 550,
    "cut": 550,
    "maintain": 700,
    "gain": 900,
    "bulk": 900,
}
DEFAULT_CALORIE_CAP = 700

# --------------------------------------------------------------------------
# Model / training (continual learning)
# --------------------------------------------------------------------------
# The model is ALWAYS trained on the evidence-based knowledge seed, so it is
# usable from day one (grounded in published guidelines, not random noise).
# As real (workout -> nutrition -> recovery) rows accumulate they are blended
# in and up-weighted, so the model regresses toward THIS app's users over time.
#
# Each real observation counts as this many seed rows when fitting, so real
# feedback quickly outweighs the generic prior.
REAL_ROW_WEIGHT = 8.0
# Real-row count at which we consider the model "matured" on real data
# (surfaced in metrics; personalization is trusted throughout regardless).
MATURE_REAL_ROWS = 50
RANDOM_STATE = 42

# FastAPI service
SERVICE_HOST = os.getenv("ML_HOST", "127.0.0.1")
SERVICE_PORT = int(os.getenv("ML_PORT", "8000"))

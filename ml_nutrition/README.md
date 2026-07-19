# FuelSync ML Nutrition Service

Personalized pre/post-workout macro recommendations that **start from published
sports-nutrition science** and **continually learn from your users' real
recovery outcomes**.

It replaces the rule-based `calcPreAdvice`/`calcPostAdvice` in
`server/controllers/suggestionController.js` with a model that predicts recovery
from workout context + nutrition, then recommends the macros that maximize
predicted recovery — grounded in evidence-based guidelines and adjusted per user.

## How it works

```
                 evidence-based seed              real user data
          (ISSN / glycogen guidelines)      (workout→nutrition→recovery)
                        │                              │
                        └──────────► TRAIN ◄───────────┘   real rows up-weighted 8×
                                       │
                        Pipeline(preprocess → GradientBoostingRegressor)
                         recovery_score = f(context, macros)
                                       │
                    OPTIMIZE: search macros (anchored to the guideline
                    ideal ± band) that maximize predicted recovery,
                    within a goal-based calorie cap, nudged toward the
                    user's usual intake
                                       │
                        FastAPI /recommend  ◄── Node suggestionController
```

- **No random synthetic data.** `seed_knowledge.py` turns published guidelines
  into a deterministic training table (see Sources below): post-workout carbs
  scale up to ~1.0–1.2 g/kg for glycogen-depleting sessions, protein ~0.25–0.35
  g/kg per serving, fat kept lower pre-workout. Recovery peaks at the guideline
  ideal and falls off as intake diverges (carbs weighted most).
- **Continual / regressive learning.** Every recovery check-in completes a
  `(workout → nutrition → recovery)` label. The Node recovery controller fires
  `POST /retrain`; the service re-blends the seed with all real rows, **weighting
  each real observation 8× the seed** (`REAL_ROW_WEIGHT`), so the model regresses
  toward this app's actual users as data grows. It's usable on day one because
  it's grounded in science, not cold.
- **Personalization.** Recommendations are nudged toward the averages of the
  user's recently logged meals (`get_user_meal_profile`).
- **Graceful fallback.** If the service is down/slow, Node falls back to the
  rule engine (`services/mlClient.js` → `null` → `calcPreAdvice/PostAdvice`).

## Files

| File | Role |
|------|------|
| `config.py` | Paths, DB, guideline constants, macro bounds, learning params |
| `features.py` | Feature schema + preprocessing (incl. per-kg derived features) |
| `seed_knowledge.py` | Evidence-based training seed (replaces synthetic data) |
| `db.py` | Loads real training data + user meal profile (auto-detects meals schema) |
| `train_recovery_model.py` | Trains/retrains the blended model (`train`/`retrain`) |
| `optimize.py` | Searches macros to maximize predicted recovery |
| `serve.py` | FastAPI: `/recommend`, `/health`, `/retrain`, `/reload` |
| `fallback.py` | Rule-based cold-start advice (mirrors the Node rules) |

## Setup & run

```bash
cd ml_nutrition
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# Train (uses the evidence-based seed; folds in real DB data if DATABASE_URL is set)
./.venv/bin/python train_recovery_model.py

# Serve (auto-trains from the seed on first boot if no model exists)
./.venv/bin/python -m uvicorn serve:app --host 127.0.0.1 --port 8000
```

The Node server talks to it via `ML_SERVICE_URL` (default `http://127.0.0.1:8000`).
Set `DATABASE_URL` in the repo-root `.env` (same one Node uses) to fold real data in.

## Endpoints

- `GET  /health` — model status + metrics (rows, R², maturity on real data)
- `POST /recommend` — `{ phase, workout_type, rpe, duration_mins, weight, goal, ... }`
  → `{ source: "ml"|"rule", suggested_carbs, suggested_protein, suggested_fats, ... }`
- `POST /retrain` — background retrain on seed + latest real data (called by Node
  after each recovery check-in)
- `POST /reload` — reload the artifact without retraining

## Current model quality

Trained on the evidence-based seed alone (no real data yet): holdout **R² ≈ 0.99,
MAE ≈ 0.6** recovery points; recommendations reproduce guideline macros
(~0.8 g/kg carbs + ~0.3 g/kg protein for hard sessions). Quality on *your* users
improves automatically as recovery check-ins accumulate.

## Database prerequisite

The recommendation write path needs `server/migrations/002_add_suggested_fats.sql`
applied (adds `suggested_fats` to the `suggestions` table). `db.py` auto-detects
whether `meals` uses the migration column names (`carbs`/`protein`/`fats`) or the
controller names (`carbs_g`/`protein_g`/`fat_g`).

## Sources (guideline basis for the seed)

- ISSN Position Stand: Protein and Exercise — https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/
- ISSN Position Stand: Nutrient Timing — https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/
- Postexercise muscle glycogen resynthesis in humans (J Appl Physiol, 2017) — https://journals.physiology.org/doi/full/10.1152/japplphysiol.00860.2016

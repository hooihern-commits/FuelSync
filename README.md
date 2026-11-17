# FuelSync

> A mobile-first health and fitness companion

FuelSync bridges the gap between your workouts and your nutrition. It tracks what you eat,
how hard you train, and how well you recover this data then uses a machine learning engine to tell
you exactly what and when to eat, personalised to your workout intensity and timing.

---

## Features

- **Meal tracking** with manual entry and AI photo recognition
- **Two-phase workout logging** — Include what you initially planned and what you have completed
- **Adaptive pre- and post-workout nutrition suggestions**
- **Morning recovery check-in** Includes a computed Recovery Score (0–100)
- **Wearable integration** with Apple HealthKit and Google Health Connect *(Phase 5)*
- **ML recommendation engine** that learns your body over time *(Phase 6)*
- **Coach / admin dashboard** for anonymised trends and suggestion accuracy *(Phase 7)*

---

## How It Works

### 1. Create Your Account
Sign up with your name, email, age, weight, height, and fitness goal.
FuelSync uses this to personalise all nutrition suggestions from day one.

### 2. Plan Your Workout
Before training, log your workout type, planned date and time, and expected
effort level (RPE 1–10). FuelSync instantly returns a pre-workout nutrition
suggestion — how many carbs, protein, and water to consume before you train,
based on your planned intensity.

### 3. Eat & Log Your Meals
Log what you ate using manual entry or AI photo recognition.

### 4. Complete Your Workout
After training, log your actual duration, RPE, heart rate, and calories burned
or connect Apple HealthKit / Google Health Connect to pull this automatically.
FuelSync returns a post-workout recovery nutrition suggestion tailored to how
hard you actually trained.

### 5. Morning Recovery Check-In
Rate how you feel across four dimensions: energy level, muscle soreness,
sleep quality, and overall feeling. Combined with optional wearable data,
FuelSync computes a **Recovery Score out of 100** — telling you clearly
whether your body is ready for the next session.

### 6. Get Smarter Over Time *(Phase 6)*
Every completed cycle — plan → eat → train → recover — generates a training
example for FuelSync's ML engine. Over time it learns your body and starts
predicting personalised macro targets based on your own history.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native, Expo|
| Backend | Node.js, Express.js, PostgreSQL (Neon.tech) |
| ML Microservice | Python, FastAPI, scikit-learn |
| Coach Dashboard | React.js, Recharts |
| Auth | JWT + bcrypt |
| DevOps | GitHub Actions CI/CD, Docker, Jest + Supertest |
| Wearables | Apple HealthKit, Google Health Connect |

---

## Project Structure
```text
fuelsync/
├── client/ # Expo mobile app
├── server/ # Node.js + Express backend API
├── ml_nutrition/ # Python FastAPI ML microservice (Phase 6)
└── dashboard/ # React.js coach/admin web dashboard (Phase 7)
```

---

## Getting Started

### Backend

```bash
cd server
npm install
cp .env.example .env    # fill in your Neon.tech database credentials
npm run dev
```

### Mobile App

```bash
cd client
npm install
npx expo start
```

> **Note:** When running on a physical device, update `client/src/api/client.ts`
> with your machine's local IPv4 address (from `ipconfig` on Windows).
> Port 3000 must be open in your firewall.

### ML Microservice *(Phase 6)*

```bash
cd ml_nutrition
pip install -r requirements.txt
uvicorn serve:app --reload
```

The service loads the newest trained model from the `ml_models` table and
retrains once a day (`RETRAIN_INTERVAL_HOURS`). See `ml_nutrition/README.md`.

### Tests

Server and ML tests run against a real Postgres database. Use a disposable
one: the tests empty every table.

```bash
# Server (applies all migrations, then runs Jest + Supertest)
cd server
DATABASE_URL=postgres://postgres@localhost:5432/fuelsync_test DATABASE_SSL=false npm test

# ML service (needs the server migrations applied to the same database)
cd ml_nutrition
pip install -r requirements.txt -r requirements-dev.txt
DATABASE_URL=postgres://postgres@localhost:5432/fuelsync_test DATABASE_SSL=false python -m pytest tests

# Client
cd client && npm test
```

GitHub Actions runs all three on every pull request (`.github/workflows/ci.yml`).

---

## API Overview

Every route is served under `/v1`. The same routes also answer at the root
path so app builds released before versioning keep working. New code should
call `/v1`.

| Method | Route | Description |
|---|---|---|
| POST | `/v1/auth/register` | Register a new user |
| POST | `/v1/auth/login` | Log in and receive a JWT |
| POST | `/v1/meals` | Log a meal |
| GET | `/v1/meals` | Meals, newest first. Optional `?limit=` and `?before=` |
| POST | `/v1/workouts` | Phase 1: plan a workout |
| PATCH | `/v1/workouts/:id` | Phase 2: complete a workout with actual stats |
| POST | `/v1/workouts/log` | Log a completed workout directly (skip Phase 1) |
| GET | `/v1/workouts` | Workouts, newest first. Optional `?limit=` and `?before=` |
| POST | `/v1/suggestions/pre` | Get a pre-workout nutrition suggestion |
| POST | `/v1/suggestions/post` | Get a post-workout recovery nutrition suggestion |
| POST | `/v1/recovery` | Submit a morning recovery check-in |
| GET | `/v1/recovery/:workout_id` | Get the recovery check-in for a specific workout |
| POST | `/v1/sync/batch` | Upload wearable samples and workouts (see below) |
| GET | `/v1/sync/state` | Saved sync anchors for one device |
| GET | `/v1/sync/summary` | Daily health summaries for a date range |

List endpoints return every row when no `limit` is given. With `limit`
(1 to 200) the response includes `next_before`; pass it back as `before` for
the next page.

### Wearable sync

HealthKit and Health Connect only run on the phone, so the app reads the data
and uploads it in batches:

```json
POST /v1/sync/batch
{
  "source": "apple_healthkit",
  "device_id": "<stable id for this phone>",
  "samples": [
    { "metric": "heart_rate", "value": 142, "start_at": "2026-11-10T08:12:05Z", "source_record_id": "<HealthKit UUID>" },
    { "metric": "steps", "value": 850, "start_at": "2026-11-10T08:00:00Z", "end_at": "2026-11-10T08:15:00Z", "source_record_id": "<id>" }
  ],
  "workouts": [
    { "source_record_id": "<id>", "type": "running", "start_time": "...", "end_time": "...",
      "heart_rate_avg": 151, "heart_rate_max": 178, "calories_burned": 520 }
  ],
  "anchors": { "heart_rate": "<HealthKit anchor>", "workouts": "<anchor>" }
}
```

- Up to 5,000 samples and 200 workouts per batch. Metrics and units are listed
  in `server/config/healthMetrics.js`.
- Sending the same batch again changes nothing. Each record is stored once per
  `source_record_id`.
- A synced workout within 2 hours of a planned one completes that plan.
- Anchors are saved in the same transaction as the data. After a failed
  upload, the device resumes from its last saved anchor (`GET /v1/sync/state`).
- Each sync rebuilds `daily_health_summary` for the days it touched and
  updates the user's resting HR baseline (30-day median, once 7 days exist).
  The recovery check-in fills resting HR, HRV and sleep from that summary
  when the user does not enter them.

---

## Database Schema

| Table | Key Fields |
|---|---|
| `users` | id, name, email, password, age, goal, resting_hr_baseline |
| `meals` | id, user_id, meal_name, calories_kcal, protein_g, carbs_g, fat_g, logged_at, suggestion_id |
| `workouts` | id, user_id, planned_type, planned_time, planned_rpe, actual stats, status, data_source, source_record_id, device |
| `suggestions` | id, workout_id, phase (pre/post), suggested macros, source (ml/rule) |
| `recovery_checkins` | id, workout_id, energy_level, muscle_soreness, sleep_quality, overall_feeling, recovery_score |
| `body_metrics` | id, user_id, height_cm, weight_kg, logged_at |
| `health_samples` | id, user_id, metric, value, unit, start_at, end_at, source, source_record_id |
| `daily_health_summary` | user_id, local_date, resting_hr, hrv_avg_ms, sleep_mins, steps, active_kcal |
| `sync_state` | user_id, device_id, source, metric, anchor |
| `ml_models` | id, name, metrics, artifact, created_at |

Schema changes are numbered SQL files in `server/migrations/`, applied with
`npm run migrate`. Allowed `data_source` values live in
`server/config/dataSources.js`, so adding a wearable needs no migration.

---

## Recovery Score Formula

The recovery score (0–100) is computed from:
- **Subjective (60 pts):** energy level (25), muscle soreness inverted (15),
  sleep quality (10), overall feeling (10)
- **Objective (40 pts):** resting heart rate vs. baseline + HRV score
  (defaults to neutral 20 if no wearable data)

---

## ML Feedback Loop
```text
Plan workout → Pre-workout suggestion → User eats
→ Complete workout (wearable or manual)
→ Post-workout suggestion → User eats recovery meal
→ Next morning: recovery check-in
→ Recovery score computed → stored for ML training
```

Each completed cycle generates one training example for the ML model,
with recovery score as the label.

---

## Team

- **Ng Hooi Hern**
- **Jayden Tam**
---

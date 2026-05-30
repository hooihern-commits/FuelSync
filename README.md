# FuelSync 🔥

> A mobile-first health and fitness companion built for NUS Orbital 2026 (Artemis Level).

FuelSync bridges the gap between your workouts and your nutrition. It tracks what you eat,
how hard you train, and how well you recover — then uses a machine learning engine to tell
you exactly what and when to eat, personalised to your workout intensity and timing.

---

## Features

### Meal Tracking
Log every meal with full macronutrient details (calories, protein, carbs, fats).
Meals can be linked to a pre- or post-workout nutrition suggestion so FuelSync can
learn whether following the advice actually improved your recovery.
A photo-based AI recognition feature lets you snap a picture of your food and have
the macros filled in automatically.

### Two-Phase Workout Logging
Workouts are logged in two stages:
- **Phase 1 — Plan:** Before your workout, you log the type, planned time, and
  your expected effort level (RPE 1–10). FuelSync immediately returns a personalised
  pre-workout nutrition suggestion based on your planned intensity.
- **Phase 2 — Complete:** After your workout, you log what actually happened —
  duration, actual RPE, average heart rate, and calories burned. FuelSync then
  returns a post-workout recovery nutrition suggestion.

### Adaptive Nutrition Suggestions
Every suggestion is generated based on your workout type, intensity, and duration.
High-intensity sessions (RPE ≥ 6) or long sessions (60+ minutes) trigger higher
carbohydrate and protein recommendations. All suggestions are stored and will be used
to train the ML model over time.

### Morning Recovery Check-In
The morning after a workout, log how you feel across four dimensions:
energy level, muscle soreness, sleep quality, and overall feeling.
FuelSync combines this with optional wearable data (resting heart rate, HRV, sleep
duration) to compute a **Recovery Score out of 100**, giving you a clear signal of
whether your body is ready for the next session.

### Wearable Integration *(Phase 5)*
FuelSync integrates with:
- **Apple HealthKit** (iOS) — reads duration, average heart rate, calories burned, and sleep data
- **Google Health Connect** (Android) — reads the same metrics

Wearable data flows directly into the workout completion and recovery check-in
endpoints. Manual entry is always available as a fallback.

### ML Recommendation Engine *(Phase 6)*
A Python FastAPI microservice trained on your historical workout and recovery data
uses scikit-learn regression to predict personalised macronutrient targets.
The model is trained on inputs like planned RPE, actual RPE, duration, heart rate,
calories burned, suggested vs. consumed macros, and whether suggestions were followed —
with recovery score as the label.

### Coach / Admin Dashboard *(Phase 7)*
A separate React.js web dashboard for coaches and admins to view anonymised user
trends, suggestion accuracy over time, and aggregate recovery data — built with Recharts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native, Expo, Expo Router |
| Backend | Node.js, Express.js, PostgreSQL (Neon.tech) |
| ML Microservice | Python, FastAPI, scikit-learn |
| Coach Dashboard | React.js, Recharts |
| Auth | JWT + bcrypt |
| DevOps | GitHub Actions CI/CD, Docker, Jest + Supertest |
| Wearables | Apple HealthKit, Google Health Connect |

---

## Project Structure
fuelsync/
├── client/ # React Native (Expo) mobile app
├── server/ # Node.js + Express backend API
├── ml/ # Python FastAPI ML microservice (Phase 6)
└── dashboard/ # React.js coach/admin web dashboard (Phase 7)


---

## API Overview

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Log in and receive a JWT |
| POST | `/meals` | Log a meal |
| GET | `/meals` | Get all meals for the logged-in user |
| POST | `/workouts` | Phase 1: plan a workout |
| PATCH | `/workouts/:id` | Phase 2: complete a workout with actual stats |
| POST | `/workouts/log` | Log a completed workout directly (skip Phase 1) |
| GET | `/workouts` | Get all workouts for the logged-in user |
| POST | `/suggestions/pre` | Get a pre-workout nutrition suggestion |
| POST | `/suggestions/post` | Get a post-workout recovery nutrition suggestion |
| POST | `/recovery` | Submit a morning recovery check-in |
| GET | `/recovery/:workout_id` | Get the recovery check-in for a specific workout |

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
cd ml
pip install -r requirements.txt
uvicorn main:app --reload
```

---

## Database Schema

| Table | Key Fields |
|---|---|
| `users` | id, name, email, password, age, weight, height, goal |
| `meals` | id, user_id, name, calories, protein, carbs, fats, meal_time, photo_url, suggestion_id |
| `workouts` | id, user_id, planned_type, planned_time, planned_rpe, actual stats, status, data_source |
| `suggestions` | id, workout_id, type (pre/post), carbs_g, protein_g, hydration_ml, notes |
| `recovery_checkins` | id, workout_id, energy_level, muscle_soreness, sleep_quality, overall_feeling, recovery_score |

---

## Recovery Score Formula

The recovery score (0–100) is computed from:
- **Subjective (60 pts):** energy level (25), muscle soreness inverted (15),
  sleep quality (10), overall feeling (10)
- **Objective (40 pts):** resting heart rate vs. baseline + HRV score
  (defaults to neutral 20 if no wearable data)

---

## ML Feedback Loop
Plan workout → Pre-workout suggestion → User eats
→ Complete workout (wearable or manual)
→ Post-workout suggestion → User eats recovery meal
→ Next morning: recovery check-in
→ Recovery score computed → stored for ML training


Each completed cycle generates one training example for the ML model,
with recovery score as the label.

---

## Team

- **Ng Hooi Hern**
- **Jayden Tam**

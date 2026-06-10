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
├── ml/ # Python FastAPI ML microservice (Phase 6)
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
cd ml
pip install -r requirements.txt
uvicorn main:app --reload
```

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

## Database Schema

| Table | Key Fields |
|---|---|
| `users` | id, name, email, password, age, weight, height, goal |
| `meals` | id, user_id, name, calories, protein, carbs, fats, meal_time, photo_url, suggestion_id |
| `workouts` | id, user_id, planned_type, planned_time, planned_rpe, actual stats, status, data_source |
| `suggestions` | id, workout_id, type (pre/post), carbs_g, protein_g, notes |
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

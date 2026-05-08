-- =============================================
-- MEALS
-- =============================================
CREATE TABLE IF NOT EXISTS meals (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  calories      DECIMAL(8,2),
  protein       DECIMAL(8,2),
  carbs         DECIMAL(8,2),
  fats          DECIMAL(8,2),
  meal_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  photo_url     TEXT,
  suggestion_id INTEGER,               -- linked after suggestions table is created
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- WORKOUTS (two-phase: planned -> completed)
-- =============================================
CREATE TABLE IF NOT EXISTS workouts (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Phase 1: Pre-workout 
  planned_type        VARCHAR(100) NOT NULL,
  planned_time        TIMESTAMPTZ NOT NULL,
  planned_rpe         INTEGER CHECK (planned_rpe BETWEEN 1 AND 10),

  -- Phase 2: Post-workout (wearable OR manual)
  actual_type         VARCHAR(100),
  actual_start_time   TIMESTAMPTZ,
  actual_end_time     TIMESTAMPTZ,
  duration_mins       INTEGER,
  actual_rpe          INTEGER CHECK (actual_rpe BETWEEN 1 AND 10),
  heart_rate_avg      INTEGER,
  heart_rate_max      INTEGER,
  calories_burned     DECIMAL(8,2),
  data_source         VARCHAR(50) DEFAULT 'manual'
                        CHECK (data_source IN ('manual','apple_healthkit','health_connect')),
  notes               TEXT,

  -- Status flag
  status              VARCHAR(20) DEFAULT 'planned'
                        CHECK (status IN ('planned','completed','skipped')),

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SUGGESTIONS (log every piece of advice given)
-- =============================================
CREATE TABLE IF NOT EXISTS suggestions (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id         INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
  phase              VARCHAR(10) NOT NULL CHECK (phase IN ('pre','post')),
  suggestion_text    TEXT NOT NULL,
  suggested_carbs    DECIMAL(8,2),
  suggested_protein  DECIMAL(8,2),
  suggested_calories DECIMAL(8,2),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Link meals back to suggestions (for ML: did they follow the advice?)
ALTER TABLE meals
  ADD CONSTRAINT fk_suggestion
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE SET NULL;

-- =============================================
-- RECOVERY CHECK-INS (morning-after feedback)
-- =============================================
CREATE TABLE IF NOT EXISTS recovery_checkins (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id          INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,

  -- Subjective (user self-report, 1–5)
  energy_level        INTEGER CHECK (energy_level BETWEEN 1 AND 5),
  muscle_soreness     INTEGER CHECK (muscle_soreness BETWEEN 1 AND 5),
  sleep_quality       INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  overall_feeling     INTEGER CHECK (overall_feeling BETWEEN 1 AND 5),

  -- Objective (from wearables, nullable)
  resting_hr          INTEGER,
  hrv_score           DECIMAL(6,2),
  sleep_duration_hrs  DECIMAL(4,2),

  -- Computed composite score (0–100)
  recovery_score      DECIMAL(5,2),

  checkin_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, workout_id)
);
-- =============================================
-- 005: Foundation for wearable data, plus indexes the existing queries need.
--
--   1. Indexes on the per-user lookups every screen runs.
--   2. workouts: drop the hard-coded data_source list, add source_record_id
--      and device so a re-synced workout updates its row instead of
--      creating a duplicate.
--   3. health_samples: raw time-series samples (heart rate, HRV, steps, ...).
--   4. daily_health_summary: one row per user per local day, rebuilt after
--      each sync. Scores and the ML model read this, never the raw samples.
--   5. sync_state: per-device anchors so a sync only sends new records.
--   6. ml_models: trained model artifacts, so a retrained model survives a
--      redeploy and every ML replica serves the same version.
--
-- Idempotent. Prereq: 000-004.
-- =============================================

-- ---------------------------------------------
-- 1. Indexes
-- ---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_meals_user_logged
  ON meals (user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_meals_suggestion
  ON meals (suggestion_id) WHERE suggestion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workouts_user_planned
  ON workouts (user_id, planned_time DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_user_status
  ON workouts (user_id, status);

CREATE INDEX IF NOT EXISTS idx_suggestions_user_created
  ON suggestions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_workout
  ON suggestions (workout_id);

CREATE INDEX IF NOT EXISTS idx_recovery_user_date
  ON recovery_checkins (user_id, checkin_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_user_created
  ON recovery_checkins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_workout
  ON recovery_checkins (workout_id);

-- ---------------------------------------------
-- 2. workouts: open data_source, add source ids
-- ---------------------------------------------
-- The allowed sources now live in server/config/dataSources.js, so adding a
-- wearable no longer needs a migration. Drop whichever CHECK constraint on
-- workouts mentions data_source (its name is auto-generated).
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'workouts'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%data_source%'
  LOOP
    EXECUTE format('ALTER TABLE workouts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS device           TEXT;

-- One row per record per source per user. Partial, so manual rows (no
-- source_record_id) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workouts_source_record
  ON workouts (user_id, data_source, source_record_id)
  WHERE source_record_id IS NOT NULL;

-- ---------------------------------------------
-- 3. health_samples (raw time series)
-- ---------------------------------------------
-- A point reading (heart rate) has start_at = end_at. An interval reading
-- (steps, sleep) spans start_at..end_at.
--
-- If this table grows past a few million rows, partition it by month on
-- start_at and add a retention job for raw samples. Daily summaries are
-- kept regardless.
CREATE TABLE IF NOT EXISTS health_samples (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric           VARCHAR(40) NOT NULL,
  value            DOUBLE PRECISION NOT NULL,
  unit             VARCHAR(20) NOT NULL,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  source           VARCHAR(50) NOT NULL,
  source_record_id TEXT NOT NULL,
  device           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at >= start_at),
  UNIQUE (user_id, source, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_health_samples_user_metric_start
  ON health_samples (user_id, metric, start_at DESC);

-- ---------------------------------------------
-- 4. daily_health_summary
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS daily_health_summary (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date   DATE NOT NULL,
  resting_hr   DECIMAL(5,1),
  hrv_avg_ms   DECIMAL(6,2),
  sleep_mins   INTEGER,
  steps        INTEGER,
  active_kcal  DECIMAL(8,2),
  hr_avg       DECIMAL(5,1),
  hr_max       DECIMAL(5,1),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, local_date)
);

-- ---------------------------------------------
-- 5. sync_state (per-device anchors)
-- ---------------------------------------------
-- anchor is opaque to the server: a HealthKit query anchor or a Health
-- Connect changes token, stored so the next sync only sends new records.
CREATE TABLE IF NOT EXISTS sync_state (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id      TEXT NOT NULL,
  source         VARCHAR(50) NOT NULL,
  metric         VARCHAR(40) NOT NULL,
  anchor         TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id, source, metric)
);

-- ---------------------------------------------
-- 6. ml_models (trained model artifacts)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS ml_models (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  metrics    JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact   BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ml_models_name_created
  ON ml_models (name, created_at DESC);

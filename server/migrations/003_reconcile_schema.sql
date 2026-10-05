-- =============================================
-- 003: Bring the schema in line with what the running code uses.
--
-- 001 defined meals as (name, calories, protein, carbs, fats, meal_time), and
-- never created body_metrics or several users columns that the controllers
-- read and write. This migration is idempotent: it is a no-op on a database
-- that already matches (the live one), and fixes one built from 000-002.
--
-- Prereq: 000_users.sql, 001_core_tables.sql
-- =============================================

-- users: columns used by auth/onboarding/recovery controllers
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_metrics_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resting_hr_baseline INTEGER;

-- meals: rename legacy 001 columns to the names mealController.js uses
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'meal_name') THEN
    ALTER TABLE meals RENAME COLUMN name TO meal_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'calories')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'calories_kcal') THEN
    ALTER TABLE meals RENAME COLUMN calories TO calories_kcal;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'protein')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'protein_g') THEN
    ALTER TABLE meals RENAME COLUMN protein TO protein_g;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'carbs')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'carbs_g') THEN
    ALTER TABLE meals RENAME COLUMN carbs TO carbs_g;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'fats')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'fat_g') THEN
    ALTER TABLE meals RENAME COLUMN fats TO fat_g;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'meal_time')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'logged_at') THEN
    ALTER TABLE meals RENAME COLUMN meal_time TO logged_at;
  END IF;
END $$;

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS meal_type   VARCHAR(30) DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(30) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS notes       TEXT;

-- body_metrics: height/weight history (bodyMetricsController.js)
CREATE TABLE IF NOT EXISTS body_metrics (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  height_cm   DECIMAL(5,1),
  weight_kg   DECIMAL(5,1) NOT NULL,
  data_source VARCHAR(30) DEFAULT 'manual',
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_body_metrics_user_logged
  ON body_metrics (user_id, logged_at DESC);

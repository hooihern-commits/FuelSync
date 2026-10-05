-- =============================================
-- 004: Record where each suggestion came from.
--
-- source             'ml' (model) or 'rule' (cold-start / fallback engine)
-- predicted_recovery model's predicted recovery score for the recommended
--                    macros (NULL for rule-based advice)
--
-- Lets suggestion accuracy be measured: predicted_recovery can later be
-- compared against the real recovery_checkins.recovery_score.
--
-- Prereq: 001_core_tables.sql
-- =============================================
ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'rule'
    CHECK (source IN ('ml','rule')),
  ADD COLUMN IF NOT EXISTS predicted_recovery DECIMAL(5,2);

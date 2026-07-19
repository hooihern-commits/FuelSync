-- =============================================
-- 002: Add the recommended fat macro to suggestions.
--
-- The suggestions table (from 001) stored carbs/protein/calories but not fat.
-- Both the rule engine and the ML model recommend a fat amount too, so this
-- stores it in the same row, next to the other suggested_* columns.
--
-- Prereq: 001_core_tables.sql
-- =============================================

ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS suggested_fats DECIMAL(8,2);

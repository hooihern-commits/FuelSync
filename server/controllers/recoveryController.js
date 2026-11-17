const { DateTime } = require('luxon');
const pool = require('../db');
const { getDailySummary } = require('../services/healthSummary');

// Score formula: 0–100
const computeRecoveryScore = ({ energy_level, muscle_soreness, sleep_quality, overall_feeling, resting_hr, hrv_score, baselineHR }) => {
  // Subjective: 60 points max
  const subjective =
    (energy_level / 5) * 25 +
    (muscle_soreness / 5) * 15 +   // inverted: less sore = better
    (sleep_quality / 5) * 10 +
    (overall_feeling / 5) * 10;

  // Objective: 40 points max (defaults to neutral 20 if no wearable data)
  let objective = 20;
  if (resting_hr && baselineHR && hrv_score) {
    const hrScore = Math.max(0, Math.min(20, 20 - ((resting_hr - baselineHR) * 2)));
    const hrvScore = Math.min(20, hrv_score / 5);
    objective = hrScore + hrvScore;
  }

  return Math.min(100, Math.round(subjective + objective));
};

// POST /recovery
const submitCheckin = async (req, res) => {
  const {
    workout_id,
    energy_level, muscle_soreness, sleep_quality, overall_feeling,
    resting_hr, hrv_score, sleep_duration_hrs
  } = req.body;
  const userId = req.user.id;

  if (!workout_id || !energy_level || !muscle_soreness || !sleep_quality || !overall_feeling) {
    return res.status(400).json({ error: 'workout_id and all 4 subjective scores are required.' });
  }

  try {
    const owned = await pool.query(
      'SELECT 1 FROM workouts WHERE id = $1 AND user_id = $2', [workout_id, userId]
    );
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Workout not found.' });

    const checkinDate = DateTime.now().setZone(req.timezone).toISODate();

    // Objective inputs. Values sent with the check-in win; anything missing
    // is filled from the day's wearable summary, if one exists.
    const [userResult, summary] = await Promise.all([
      pool.query('SELECT resting_hr_baseline FROM users WHERE id = $1', [userId]),
      getDailySummary(pool, userId, checkinDate),
    ]);
    const num = (v) => (v == null ? null : Number(v));
    const restingHr = resting_hr || num(summary?.resting_hr);
    const hrvScore = hrv_score || num(summary?.hrv_avg_ms);
    const sleepHrs = sleep_duration_hrs
      || (summary?.sleep_mins != null ? Math.round((summary.sleep_mins / 60) * 100) / 100 : null);

    // Baseline: the user's rolling median resting HR (kept up to date by the
    // sync), else today's reading, else a typical adult value.
    const baselineHR = userResult.rows[0]?.resting_hr_baseline || restingHr || 60;

    const recovery_score = computeRecoveryScore({
      energy_level, muscle_soreness, sleep_quality, overall_feeling,
      resting_hr: restingHr, hrv_score: hrvScore, baselineHR
    });

    const result = await pool.query(
      `INSERT INTO recovery_checkins
        (user_id, workout_id, energy_level, muscle_soreness, sleep_quality, overall_feeling,
         resting_hr, hrv_score, sleep_duration_hrs, recovery_score, checkin_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id, workout_id) DO UPDATE SET
         energy_level=$3, muscle_soreness=$4, sleep_quality=$5, overall_feeling=$6,
         resting_hr=$7, hrv_score=$8, sleep_duration_hrs=$9, recovery_score=$10,
         checkin_date=$11
       RETURNING *`,
      [userId, workout_id, energy_level, muscle_soreness, sleep_quality, overall_feeling,
       restingHr != null ? Math.round(restingHr) : null, hrvScore ?? null, sleepHrs ?? null,
       recovery_score, checkinDate]
    );
    // The ML service retrains on its own schedule (see ml_nutrition/serve.py),
    // so a check-in no longer triggers a retrain.

    res.status(201).json({ message: 'Check-in saved!', recovery_score, checkin: result.rows[0] });
  } catch (err) {
    console.error('submitCheckin error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /recovery/:workout_id
const getCheckin = async (req, res) => {
  const { workout_id } = req.params;
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT * FROM recovery_checkins WHERE workout_id=$1 AND user_id=$2',
      [workout_id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No check-in found.' });
    res.json({ checkin: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /recovery/latest — most recent recovery check-in (for the home gauge)
const getLatestRecovery = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT * FROM recovery_checkins WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    res.json({ checkin: result.rows[0] ?? null });
  } catch (err) {
    console.error('getLatestRecovery error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { submitCheckin, getCheckin, getLatestRecovery };
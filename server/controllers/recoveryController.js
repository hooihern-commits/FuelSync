const pool = require('../db');

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
    // Get user's baseline HR from their profile for objective scoring
    const userResult = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
    const baselineHR = userResult.rows[0]?.resting_hr_baseline || resting_hr || 60;

    const recovery_score = computeRecoveryScore({
      energy_level, muscle_soreness, sleep_quality, overall_feeling,
      resting_hr, hrv_score, baselineHR
    });

    const checkinDate = DateTime.now().setZone(req.timezone).toISODate();

    const result = await pool.query(
      `INSERT INTO recovery_checkins
        (user_id, workout_id, energy_level, muscle_soreness, sleep_quality, overall_feeling,
         resting_hr, hrv_score, sleep_duration_hrs, recovery_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, workout_id) DO UPDATE SET
         energy_level=$3, muscle_soreness=$4, sleep_quality=$5, overall_feeling=$6,
         resting_hr=$7, hrv_score=$8, sleep_duration_hrs=$9, recovery_score=$10
       RETURNING *`,
      [userId, workout_id, energy_level, muscle_soreness, sleep_quality, overall_feeling,
       resting_hr||null, hrv_score||null, sleep_duration_hrs||null, recovery_score]
    );
    // A recovery check-in completes a (workout -> nutrition -> recovery) label,
    // so nudge the ML model to retrain on the latest data. Fire-and-forget:
    // this must not delay or fail the response.
    triggerRetrain();

    res.status(201).json({ message: 'Check-in saved!', recovery_score, checkin: result.rows[0] });
  } catch (err) {
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

module.exports = { submitCheckin, getCheckin };
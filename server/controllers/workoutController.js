const pool = require('../db');

// POST /workouts — Phase 1: plan a workout pre-workout
const createWorkout = async (req, res) => {
  const { planned_type, planned_time, planned_rpe } = req.body;
  const userId = req.user.id;
    if (!planned_type || !planned_time || !planned_rpe) {
      return res.status(400).json({
        error: 'planned_type, planned_time, and planned_rpe are all required.'
      });
    }
  try {
    const result = await pool.query(
      `INSERT INTO workouts (user_id, planned_type, planned_time, planned_rpe)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, planned_type, planned_time, planned_rpe||null]
    );
    res.status(201).json({ message: 'Workout planned!', workout: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

// PATCH /workouts/:id — Phase 2: log actual results post-workout
const updateWorkout = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const {
    actual_type, actual_start_time, actual_end_time,
    actual_rpe, heart_rate_avg, calories_burned,
    data_source, notes, status
  } = req.body;

  try {
    const check = await pool.query(
      'SELECT id FROM workouts WHERE id=$1 AND user_id=$2', [id, userId]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ error: 'Workout not found.' });

    // Compute duration if both times provided, otherwise null
    let duration_mins = null;
    if (actual_start_time && actual_end_time) {
      const start = new Date(actual_start_time);
      const end = new Date(actual_end_time);
      if (end <= start) return res.status(400).json({ error: 'End time must be after start time.' });
      duration_mins = Math.round((end - start) / 60000);
    }

    const result = await pool.query(
      `UPDATE workouts SET
        actual_type       = COALESCE($1, actual_type),
        actual_start_time = COALESCE($2, actual_start_time),
        actual_end_time   = COALESCE($3, actual_end_time),
        duration_mins     = COALESCE($4, duration_mins),
        actual_rpe        = COALESCE($5, actual_rpe),
        heart_rate_avg    = COALESCE($6, heart_rate_avg),
        calories_burned   = COALESCE($7, calories_burned),
        data_source       = COALESCE($8, data_source),
        notes             = COALESCE($9, notes),
        status            = COALESCE($10, status),
        updated_at        = NOW()
      WHERE id=$11 AND user_id=$12 RETURNING *`,
      [
        actual_type, actual_start_time, actual_end_time, duration_mins,
        actual_rpe, heart_rate_avg ?? null, calories_burned ?? null,
        data_source, notes, status, id, userId
      ]
    );

    res.json({
      message: 'Workout updated!',
      duration_mins,
      workout: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

// POST /workouts/log — Skip Phase 1, log a completed workout directly (forgot to plan)
const logCompletedWorkout = async (req, res) => {
  const {
    actual_type, actual_start_time, actual_end_time, duration_mins,
    actual_rpe, heart_rate_avg, heart_rate_max, calories_burned,
    data_source, notes
  } = req.body;
  const userId = req.user.id;

  if (!actual_type || !duration_mins || !actual_rpe) {
    return res.status(400).json({
      error: 'actual_type, duration_mins, and actual_rpe are required.'
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO workouts (
        user_id,
        planned_type, planned_time, planned_rpe,
        actual_type, actual_start_time, actual_end_time, duration_mins,
        actual_rpe, heart_rate_avg, heart_rate_max, calories_burned,
        data_source, notes, status
      ) VALUES (
        $1,
        $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, 'completed'
      ) RETURNING *`,
      [
        userId,
        actual_type, actual_start_time || new Date(), actual_rpe,
        actual_type, actual_start_time || null, actual_end_time || null, duration_mins,
        actual_rpe, heart_rate_avg || null, heart_rate_max || null, calories_burned || null,
        data_source || 'manual', notes || null
      ]
    );
    res.status(201).json({
      message: 'Workout logged!',
      note: 'No pre-workout plan was recorded for this session.',
      workout: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

const getWorkouts = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT * FROM workouts WHERE user_id=$1 ORDER BY planned_time DESC`, [userId]
    );
    res.json({ workouts: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { createWorkout, updateWorkout, getWorkouts, logCompletedWorkout };
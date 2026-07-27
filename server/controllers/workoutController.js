const pool = require('../db');

// POST /workouts — Plan a workout
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
      `INSERT INTO workouts (user_id, planned_type, planned_time, planned_rpe, status)
       VALUES ($1, $2, $3, $4, 'planned') RETURNING *`,
      [userId, planned_type, planned_time, planned_rpe ?? null]
    );
    res.status(201).json({ message: 'Workout planned!', workout: result.rows[0] });
  } catch (err) {
    console.error('createWorkout error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /workouts/planned — Fetch planned but not yet completed workouts
const getPlannedWorkouts = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT * FROM workouts
       WHERE user_id = $1
         AND status = 'planned'
         AND actual_type IS NULL
       ORDER BY planned_time ASC`,
      [userId]
    );
    res.json({ workouts: result.rows });
  } catch (err) {
    console.error('getPlannedWorkouts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /workouts — Get all workouts for user
const getWorkouts = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT * FROM workouts WHERE user_id = $1 ORDER BY planned_time DESC`,
      [userId]
    );
    res.json({ workouts: result.rows });
  } catch (err) {
    console.error('getWorkouts error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// POST /workouts/log — Log a completed workout with no prior plan
const logCompletedWorkout = async (req, res) => {
  const {
    actual_type,
    actual_start_time,
    actual_end_time,
    actual_rpe,
    heart_rate_avg,
    calories_burned,
    data_source,
    notes
  } = req.body;
  const userId = req.user.id;

  console.log('logCompletedWorkout body:', req.body);

  if (!actual_type || !actual_start_time || !actual_end_time || actual_rpe == null) {
    return res.status(400).json({
      error: 'actual_type, actual_start_time, actual_end_time, and actual_rpe are all required.'
    });
  }

  const start = new Date(actual_start_time);
  const end = new Date(actual_end_time);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Invalid date format for start or end time.' });
  }

  if (end <= start) {
    return res.status(400).json({ error: 'actual_end_time must be after actual_start_time.' });
  }

  const duration_mins = Math.round((end - start) / 60000);

  try {
    const result = await pool.query(
      `INSERT INTO workouts (
        user_id,
        planned_type, planned_time, planned_rpe,
        actual_type, actual_start_time, actual_end_time, duration_mins,
        actual_rpe, heart_rate_avg, calories_burned,
        data_source, notes, status
      ) VALUES (
        $1,
        $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, 'completed'
      ) RETURNING *`,
      [
        userId,
        actual_type, actual_start_time, actual_rpe,
        actual_type, actual_start_time, actual_end_time, duration_mins,
        actual_rpe,
        heart_rate_avg || null,
        calories_burned || null,
        data_source || 'manual',
        notes || null
      ]
    );

    console.log('logCompletedWorkout success, duration_mins:', duration_mins);

    res.status(201).json({
      message: 'Workout logged!',
      duration_mins,
      workout: result.rows[0]
    });
  } catch (err) {
    console.error('logCompletedWorkout error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// PATCH /workouts/:id — Update a planned workout with actual results or mark as skipped
const updateWorkout = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  console.log('updateWorkout body:', req.body);

  const {
    actual_type,
    actual_start_time,
    actual_end_time,
    actual_rpe,
    heart_rate_avg,
    calories_burned,
    data_source,
    notes,
    status
  } = req.body;

  try {
    const check = await pool.query(
      'SELECT id FROM workouts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Workout not found.' });
    }

    // If marking as skipped, null out all actual fields
    if (status === 'skipped') {
      const result = await pool.query(
        `UPDATE workouts SET
          status            = 'skipped',
          actual_type       = NULL,
          actual_start_time = NULL,
          actual_end_time   = NULL,
          duration_mins     = NULL,
          actual_rpe        = NULL,
          heart_rate_avg    = NULL,
          calories_burned   = NULL,
          updated_at        = NOW()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId]
      );
      return res.json({
        message: 'Workout marked as skipped.',
        workout: result.rows[0]
      });
    }

    // Completing a workout — validate required fields
    if (!actual_type || !actual_start_time || !actual_end_time || actual_rpe == null) {
      return res.status(400).json({
        error: 'actual_type, actual_start_time, actual_end_time, and actual_rpe are all required.'
      });
    }

    const start = new Date(actual_start_time);
    const end = new Date(actual_end_time);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for start or end time.' });
    }

    if (end <= start) {
      return res.status(400).json({ error: 'End time must be after start time.' });
    }

    const duration_mins = Math.round((end - start) / 60000);

    const result = await pool.query(
      `UPDATE workouts SET
        actual_type       = $1,
        actual_start_time = $2,
        actual_end_time   = $3,
        duration_mins     = $4,
        actual_rpe        = $5,
        heart_rate_avg    = $6,
        calories_burned   = $7,
        data_source       = $8,
        notes             = $9,
        status            = 'completed',
        updated_at        = NOW()
      WHERE id = $10 AND user_id = $11 RETURNING *`,
      [
        actual_type,
        actual_start_time,
        actual_end_time,
        duration_mins,
        actual_rpe,
        heart_rate_avg || null,
        calories_burned || null,
        data_source || 'manual',
        notes || null,
        id,
        userId
      ]
    );

    console.log('updateWorkout success, duration_mins:', duration_mins);

    res.json({
      message: 'Workout updated!',
      duration_mins,
      workout: result.rows[0]
    });
  } catch (err) {
    console.error('updateWorkout error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getWorkoutById = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT * FROM workouts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workout not found.' });
    }

    res.json({ workout: result.rows[0] });
  } catch (err) {
    console.error('getWorkoutById error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  createWorkout,
  updateWorkout,
  getWorkouts,
  getPlannedWorkouts,
  logCompletedWorkout,
  getWorkoutById
};
const pool = require('../db');

// Rule-based logic (v1 — will be replaced by ML model)
const calcPreAdvice = (type, rpe) => {
  const intense = rpe >= 6;
  const cardio = ['running','cycling','hiit','swimming','football','soccer','rugby','touch rugby','hockey','lacrosse','ultimate frisbee','basketball','volleyball','badminton','tennis','squash','table tennis'].includes(type.toLowerCase());
  if (intense && cardio) return {
    text: 'High-intensity cardio ahead. Eat 60–80g carbs + 20–25g protein 2–3 hrs before. Keep fat low.',
    suggested_carbs: 70, suggested_protein: 22, suggested_calories: 450
  };
  if (intense) return {
    text: 'Heavy session planned. Have 50–60g carbs + 25–30g protein 1.5–2 hrs before.',
    suggested_carbs: 55, suggested_protein: 28, suggested_calories: 400
  };
  return {
    text: 'Light session ahead. A small snack works: 30g carbs + 15g protein, 1 hr before.',
    suggested_carbs: 30, suggested_protein: 15, suggested_calories: 220
  };
};

const calcPostAdvice = (rpe, duration_mins) => {
  const intense = rpe >= 6 || duration_mins >= 60;
  if (intense) return {
    text: 'Hard effort! Recover with 40–50g protein + 80–100g carbs within 45 mins. Rehydrate.',
    suggested_carbs: 90, suggested_protein: 45, suggested_calories: 600
  };
  return {
    text: 'Good work. A moderate recovery meal works: 25–30g protein + 50g carbs.',
    suggested_carbs: 50, suggested_protein: 28, suggested_calories: 350
  };
};

// POST /suggestions/pre
const preWorkoutAdvice = async (req, res) => {
  const { workout_id } = req.body;
  const userId = req.user.id;
  try {
    const workout = await pool.query(
      'SELECT * FROM workouts WHERE id=$1 AND user_id=$2', [workout_id, userId]
    );
    if (workout.rows.length === 0) return res.status(404).json({ error: 'Workout not found.' });

    const { planned_type, planned_rpe } = workout.rows[0];
    const advice = calcPreAdvice(planned_type, planned_rpe);

    const saved = await pool.query(
      `INSERT INTO suggestions (user_id, workout_id, phase, suggestion_text, suggested_carbs, suggested_protein, suggested_calories)
       VALUES ($1,$2,'pre',$3,$4,$5,$6) RETURNING *`,
      [userId, workout_id, advice.text, advice.suggested_carbs, advice.suggested_protein, advice.suggested_calories]
    );
    res.json({ phase: 'pre', suggestion_id: saved.rows[0].id, ...advice });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

// POST /suggestions/post
const postWorkoutAdvice = async (req, res) => {
  const { workout_id } = req.body;
  const userId = req.user.id;
  try {
    const workout = await pool.query(
      'SELECT * FROM workouts WHERE id=$1 AND user_id=$2', [workout_id, userId]
    );
    if (workout.rows.length === 0) return res.status(404).json({ error: 'Workout not found.' });

    const { actual_rpe, duration_mins, status } = workout.rows[0];
    if (status !== 'completed') {
      return res.status(400).json({ error: 'Complete the workout first via PATCH /workouts/:id.' });
    }

    const advice = calcPostAdvice(actual_rpe, duration_mins);

    const saved = await pool.query(
      `INSERT INTO suggestions (user_id, workout_id, phase, suggestion_text, suggested_carbs, suggested_protein, suggested_calories)
       VALUES ($1,$2,'post',$3,$4,$5,$6) RETURNING *`,
      [userId, workout_id, advice.text, advice.suggested_carbs, advice.suggested_protein, advice.suggested_calories]
    );
    res.json({ phase: 'post', suggestion_id: saved.rows[0].id, ...advice });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { preWorkoutAdvice, postWorkoutAdvice };
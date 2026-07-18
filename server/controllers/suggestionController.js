const pool = require('../db');
const { getRecommendation } = require('../services/mlClient');

// --------------------------------------------------------------------------
// Rule-based logic (v1) — now the COLD-START FALLBACK used whenever the ML
// service is unavailable or not yet trained on enough data. Kept in sync with
// ml_nutrition/fallback.py.
// --------------------------------------------------------------------------
const calcPreAdvice = (type, rpe) => {
  const intense = rpe >= 6;
  const cardio = ['running','cycling','hiit','swimming','football','basketball','badminton','tennis','other'].includes((type||'other').toLowerCase());
  if (intense && cardio) return {
    text: 'High-intensity cardio ahead. Eat 60–80g carbs + 20–25g protein 2–3 hrs before. Keep fat low.',
    suggested_carbs: 70, suggested_protein: 22, suggested_fats: 8, suggested_calories: 450
  };
  if (intense) return {
    text: 'Heavy session planned. Have 50–60g carbs + 25–30g protein 1.5–2 hrs before.',
    suggested_carbs: 55, suggested_protein: 28, suggested_fats: 8, suggested_calories: 400
  };
  return {
    text: 'Light session ahead. A small snack works: 30g carbs + 15g protein, 1 hr before.',
    suggested_carbs: 30, suggested_protein: 15, suggested_fats: 5, suggested_calories: 220
  };
};

const calcPostAdvice = (rpe, duration_mins) => {
  const intense = rpe >= 6 || duration_mins >= 60;
  if (intense) return {
    text: 'Hard effort! Recover with 40–50g protein + 80–100g carbs within 45 mins. Rehydrate.',
    suggested_carbs: 90, suggested_protein: 45, suggested_fats: 12, suggested_calories: 600
  };
  return {
    text: 'Good work. A moderate recovery meal works: 25–30g protein + 50g carbs.',
    suggested_carbs: 50, suggested_protein: 28, suggested_fats: 8, suggested_calories: 350
  };
};

// Average macros of a user's most recent meals — passed to the model so the
// recommendation references what the user actually eats.
const getMealProfile = async (userId) => {
  try {
    const r = await pool.query(
      `SELECT AVG(carbs_g) AS carbs, AVG(protein_g) AS protein,
              AVG(fat_g) AS fats, COUNT(*)::int AS n
       FROM (
         SELECT carbs_g, protein_g, fat_g
         FROM meals WHERE user_id = $1
         ORDER BY logged_at DESC LIMIT 30
       ) recent`,
      [userId]
    );
    const row = r.rows[0];
    if (!row || !row.n) return null;
    return {
      avg_carbs: Number(row.carbs) || 0,
      avg_protein: Number(row.protein) || 0,
      avg_fats: Number(row.fats) || 0,
      n_meals: row.n,
    };
  } catch (err) {
    console.warn('getMealProfile failed:', err.message);
    return null;
  }
};

// Try the ML service; fall back to the rule engine. Returns
// { advice, source, predicted_recovery }.
const getAdvice = async ({ phase, workout, user, mealProfile }) => {
  const payload = {
    phase,
    workout_type: workout.actual_type || workout.planned_type,
    rpe: workout.actual_rpe ?? workout.planned_rpe,
    duration_mins: workout.duration_mins,
    heart_rate_avg: workout.heart_rate_avg,
    calories_burned: workout.calories_burned,
    weight: user?.weight,
    goal: user?.goal,
    ...(mealProfile || {}),
  };

  const ml = await getRecommendation(payload);
  if (ml && ml.source === 'ml') {
    return {
      advice: {
        text: ml.text,
        suggested_carbs: ml.suggested_carbs,
        suggested_protein: ml.suggested_protein,
        suggested_fats: ml.suggested_fats,
        suggested_calories: ml.suggested_calories,
      },
      source: 'ml',
      predicted_recovery: ml.predicted_recovery ?? null,
    };
  }

  // Fallback (ML unavailable or cold). Prefer the service's own rule output if
  // it returned one, otherwise compute locally.
  if (ml && ml.source === 'rule') {
    return {
      advice: {
        text: ml.text,
        suggested_carbs: ml.suggested_carbs,
        suggested_protein: ml.suggested_protein,
        suggested_fats: ml.suggested_fats,
        suggested_calories: ml.suggested_calories,
      },
      source: 'rule',
      predicted_recovery: null,
    };
  }

  const advice = phase === 'pre'
    ? calcPreAdvice(workout.planned_type, workout.planned_rpe)
    : calcPostAdvice(workout.actual_rpe, workout.duration_mins);
  return { advice, source: 'rule', predicted_recovery: null };
};

const saveSuggestion = async ({ userId, workoutId, phase, advice }) => {
  const saved = await pool.query(
    `INSERT INTO suggestions
       (user_id, workout_id, phase, suggestion_text,
        suggested_carbs, suggested_protein, suggested_calories, suggested_fats)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, workoutId, phase, advice.text,
     advice.suggested_carbs, advice.suggested_protein, advice.suggested_calories,
     advice.suggested_fats ?? null]
  );
  return saved.rows[0];
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

    const userRes = await pool.query('SELECT weight, goal FROM users WHERE id=$1', [userId]);
    const mealProfile = await getMealProfile(userId);

    const { advice, source, predicted_recovery } = await getAdvice({
      phase: 'pre', workout: workout.rows[0], user: userRes.rows[0], mealProfile,
    });

    const saved = await saveSuggestion({
      userId, workoutId: workout_id, phase: 'pre', advice, source, predicted_recovery,
    });
    res.json({ phase: 'pre', suggestion_id: saved.id, source, ...advice });
  } catch (err) {
    console.error('preWorkoutAdvice error:', err);
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

    if (workout.rows[0].status !== 'completed') {
      return res.status(400).json({ error: 'Complete the workout first via PATCH /workouts/:id.' });
    }

    const userRes = await pool.query('SELECT weight, goal FROM users WHERE id=$1', [userId]);
    const mealProfile = await getMealProfile(userId);

    const { advice, source, predicted_recovery } = await getAdvice({
      phase: 'post', workout: workout.rows[0], user: userRes.rows[0], mealProfile,
    });

    const saved = await saveSuggestion({
      userId, workoutId: workout_id, phase: 'post', advice, source, predicted_recovery,
    });
    res.json({ phase: 'post', suggestion_id: saved.id, source, ...advice });
  } catch (err) {
    console.error('postWorkoutAdvice error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { preWorkoutAdvice, postWorkoutAdvice };

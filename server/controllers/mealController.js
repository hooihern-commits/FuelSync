const pool = require('../db');

const logMeal = async (req, res) => {
  const { meal_name, calories_kcal, protein_g, carbs_g, fat_g, meal_type, logged_at, data_source, notes, suggestion_id } = req.body;
  const userId = req.user.id;
  if (!meal_name) return res.status(400).json({ error: 'Meal name is required.' });
  try {
    const result = await pool.query(
      `INSERT INTO meals (user_id, meal_name, calories_kcal, protein_g, carbs_g, fat_g, meal_type, logged_at, data_source, notes, suggestion_id )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [userId, meal_name, calories_kcal||0, protein_g||0, carbs_g||0, fat_g||0, meal_type??'general',
       logged_at||new Date(), data_source||'manual', notes||null, suggestion_id??null]
    );
    res.status(201).json({ message: 'Meal logged!', meal: result.rows[0] });
  } catch (err) {
    console.error('logMeal error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getMeals = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT * FROM meals WHERE user_id=$1 ORDER BY logged_at DESC`, [userId]
    );
    res.json({ meals: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { logMeal, getMeals };
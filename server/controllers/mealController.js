const pool = require('../db');
const { isDataSource } = require('../config/dataSources');
const { parsePage, nextBefore } = require('../services/pagination');

const logMeal = async (req, res) => {
  const { meal_name, calories_kcal, protein_g, carbs_g, fat_g, meal_type, logged_at, data_source, notes, suggestion_id } = req.body;
  const userId = req.user.id;
  if (!meal_name) return res.status(400).json({ error: 'Meal name is required.' });
  if (data_source != null && !isDataSource(data_source)) {
    return res.status(400).json({ error: 'Unknown data_source.' });
  }
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

// GET /meals — newest first. Pass ?limit= (and ?before=) to page.
const getMeals = async (req, res) => {
  const userId = req.user.id;
  const page = parsePage(req.query);
  if (page.error) return res.status(400).json({ error: page.error });
  try {
    const result = await pool.query(
      `SELECT * FROM meals
        WHERE user_id = $1
          AND ($2::timestamptz IS NULL OR logged_at < $2::timestamptz)
        ORDER BY logged_at DESC
        LIMIT $3`,
      [userId, page.before, page.limit]
    );
    res.json({ meals: result.rows, next_before: nextBefore(result.rows, page.limit, 'logged_at') });
  } catch (err) {
    console.error('getMeals error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { logMeal, getMeals };
const pool = require('../db');

const logMeal = async (req, res) => {
  const { name, calories, protein, carbs, fats, meal_time, photo_url, suggestion_id } = req.body;
  const userId = req.user.id;
  if (!name) return res.status(400).json({ error: 'Meal name is required.' });
  try {
    const result = await pool.query(
      `INSERT INTO meals (user_id, name, calories, protein, carbs, fats, meal_time, photo_url, suggestion_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userId, name, calories||0, protein||0, carbs||0, fats||0,
       meal_time||new Date(), photo_url||null, suggestion_id||null]
    );
    res.status(201).json({ message: 'Meal logged!', meal: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

const getMeals = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT * FROM meals WHERE user_id=$1 ORDER BY meal_time DESC`, [userId]
    );
    res.json({ meals: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { logMeal, getMeals };
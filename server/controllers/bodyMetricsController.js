const pool = require('../db');

async function logMetrics(req, res) {
  const { height_cm, weight_kg, data_source = 'manual' } = req.body;
  const userId = req.user.id;

  if (!weight_kg) {
    return res.status(400).json({ error: 'weight_kg is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO body_metrics (user_id, height_cm, weight_kg, data_source)
       VALUES ($1, 
       COALESCE($2, (SELECT height_cm FROM body_metrics WHERE user_id = $1 AND height_cm IS NOT NULL ORDER BY logged_at DESC LIMIT 1)), 
       $3, $4)
       RETURNING *`,
      [userId, height_cm ?? null, weight_kg, data_source]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('logMetrics error:', err.message);
    res.status(500).json({ error: 'Failed to log body metrics' });
  }
}

async function getLatest(req, res) {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT * FROM body_metrics
       WHERE user_id = $1
       ORDER BY logged_at DESC
       LIMIT 1`,
      [userId]
    );
    res.json(result.rows[0] ?? null);
  } catch (err) {
    console.error('getLatest error:', err.message);
    res.status(500).json({ error: 'Failed to fetch latest metrics' });
  }
}

async function getHistory(req, res) {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT * FROM body_metrics
       WHERE user_id = $1
       ORDER BY logged_at ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('getHistory error:', err.message);
    res.status(500).json({ error: 'Failed to fetch metrics history' });
  }
}

module.exports = { logMetrics, getLatest, getHistory };
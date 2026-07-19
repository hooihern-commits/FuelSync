const pool = require('../db');

async function completeOnboarding(req, res) {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `UPDATE users SET onboarding_metrics_done = true
       WHERE id = $1
       RETURNING id, onboarding_metrics_done`,
      [userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('completeOnboarding error:', err.message);
    res.status(500).json({ error: 'Failed to update onboarding status' });
  }
}

module.exports = { completeOnboarding };
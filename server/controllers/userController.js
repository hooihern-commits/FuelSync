const pool = require('../db');

async function completeOnboarding(req, res) {
  const userId = req.user.id;
  const { age } = req.body;
  const ageNum = age == null ? null : Number(age);

  if (ageNum != null && (!Number.isFinite(ageNum) || ageNum <= 0 || ageNum > 120)) {
    return res.status(400).json({ error: 'age must be a number between 1 and 120.' });
  }

  try {
    const result = await pool.query(
      `UPDATE users
         SET onboarding_metrics_done = true,
             age = COALESCE($2, age)
       WHERE id = $1
       RETURNING id, age, onboarding_metrics_done`,
      [userId, ageNum]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('completeOnboarding error:', err.message);
    res.status(500).json({ error: 'Failed to update onboarding status' });
  }
}

module.exports = { completeOnboarding };
const pool = require('../db');
const bcrypt = require('bcrypt');

// PATCH /users/profile — update display name
async function updateProfile(req, res) {
  const userId = req.user.id;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  try {
    const result = await pool.query(
      `UPDATE users SET name = $1 WHERE id = $2
       RETURNING id, name, email, onboarding_metrics_done`,
      [name.trim(), userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('updateProfile error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

// PATCH /users/password — verify current password, set a new one
async function changePassword(req, res) {
  const userId = req.user.id;
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required.' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  try {
    const r = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const ok = await bcrypt.compare(current_password, r.rows[0].password);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' });

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);
    res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error('changePassword error:', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

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

module.exports = { completeOnboarding, updateProfile, changePassword };
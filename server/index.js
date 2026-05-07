const express = require('express');
const app = express();

require('dotenv').config();

const authRoutes = require('./routes/auth');
const pool = require('./db');

app.use(express.json());
app.use('/auth', authRoutes);

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Database connected at:', res.rows[0].now);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
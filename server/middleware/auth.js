// middleware/auth.js
require('dotenv').config();
const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token. Please log in.' });
  }
  const token = authHeader.split(' ')[1];

  console.log('TOKEN RECEIVED:', token);
  console.log('JWT SECRET:', process.env.JWT_SECRET);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('JWT ERROR:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = { protect };
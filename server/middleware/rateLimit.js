const { rateLimit } = require('express-rate-limit');

// Limits are per client IP and per minute unless noted. Each can be tuned
// with an environment variable. Tests run with limits off.
const skip = () => process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_DISABLED === 'true';
const num = (name, fallback) => parseInt(process.env[name] || String(fallback), 10);

const make = (windowMs, limit) => rateLimit({
  windowMs,
  limit,
  skip,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.' },
});

// Everything.
const apiLimiter = make(60 * 1000, num('RATE_LIMIT_PER_MIN', 300));
// Login and register: slows password guessing. Per 15 minutes.
const authLimiter = make(15 * 60 * 1000, num('RATE_LIMIT_AUTH_PER_15MIN', 30));
// Wearable sync: batches are large, so fewer calls are allowed.
const syncLimiter = make(60 * 1000, num('RATE_LIMIT_SYNC_PER_MIN', 60));

module.exports = { apiLimiter, authLimiter, syncLimiter };

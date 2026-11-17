require('dotenv').config();
const express = require('express');
const { attachTimezone } = require('./middleware/timezone');
const { apiLimiter } = require('./middleware/rateLimit');
const api = require('./routes');

const app = express();

// Behind a host's proxy (Railway, Render) the client IP is in
// X-Forwarded-For. Rate limiting needs the real one.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY || '1', 10));

// A sync batch holds thousands of samples, so only that route gets a larger
// body limit. It must be registered before the default parser.
const syncBody = express.json({ limit: '2mb' });
app.use(['/v1/sync', '/sync'], syncBody);
app.use(express.json());

app.use(apiLimiter);
app.use(attachTimezone);

// /v1 is the versioned API. The root mount keeps existing app builds working
// and can be removed once they are no longer in use.
app.use('/v1', api);
app.use('/', api);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Malformed or oversized JSON bodies.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Server error.' });
});

module.exports = app;

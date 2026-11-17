// Shared test setup. Tests run against a real Postgres database named by
// DATABASE_URL, because the
// behaviour under test is mostly SQL: upserts, unique indexes, aggregates.
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_SSL = process.env.DATABASE_SSL || 'false';
// Nothing listens here, so suggestion tests exercise the rule fallback.
process.env.ML_SERVICE_URL = 'http://127.0.0.1:9';
process.env.ML_TIMEOUT_MS = '300';

const pool = require('../db');
const app = require('../app');

const TABLES = [
  'sync_state', 'daily_health_summary', 'health_samples', 'recovery_checkins',
  'meals', 'suggestions', 'workouts', 'body_metrics', 'users',
];

const resetDb = async () => {
  await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
};

let counter = 0;
const createUser = async () => {
  counter += 1;
  const res = await request(app)
    .post('/v1/auth/register')
    .send({ name: 'Test User', email: `user${counter}-${Date.now()}@example.com`, password: 'secret123' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.user.id, token: res.body.token };
};

// An authenticated supertest request: api(user).post('/v1/meals')...
const api = (user, timezone = 'UTC') => {
  const withAuth = (req) => req.set('Authorization', `Bearer ${user.token}`).set('X-Timezone', timezone);
  return {
    get: (url) => withAuth(request(app).get(url)),
    post: (url) => withAuth(request(app).post(url)),
    patch: (url) => withAuth(request(app).patch(url)),
  };
};

module.exports = { app, pool, resetDb, createUser, api, request };

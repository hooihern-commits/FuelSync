const { Pool } = require('pg');
require('dotenv').config();

// Hosted Postgres (Neon) needs TLS. A local or CI database usually has none,
// so DATABASE_SSL=false turns it off.
const useSsl = (process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
});

module.exports = pool;

// Runs once before all test files: apply every migration to the test
// database. This also proves the migrations run cleanly from empty.
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL to a disposable Postgres database before running tests.');
  }
  execFileSync(process.execPath, [path.join(__dirname, '..', 'setup.js')], {
    env: { ...process.env, DATABASE_SSL: process.env.DATABASE_SSL || 'false' },
    stdio: 'inherit',
  });
};

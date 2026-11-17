module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  globalSetup: './tests/globalSetup.js',
  // Test files share one database, so they run one at a time.
  maxWorkers: 1,
};

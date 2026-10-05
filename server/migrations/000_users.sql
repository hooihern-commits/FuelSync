-- =============================================
-- 000: Base users table (previously created ad hoc by setup.js).
-- Must run before 001, which references users(id).
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(150) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  age        INTEGER,
  weight     DECIMAL,
  height     DECIMAL,
  goal       VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

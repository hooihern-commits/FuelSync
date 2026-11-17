// Rolls raw health_samples up into daily_health_summary.
//
// Scores, readiness and the ML model read the summary table, so their
// queries stay small however many samples a user has. The rebuild runs for
// the days a sync touched, inside the sync's transaction.

const BASELINE_WINDOW_DAYS = 30;  // resting HR baseline looks back this far
const BASELINE_MIN_DAYS = 7;      // and needs at least this many days of data

// Every day in [fromDate, toDate] is rebuilt from scratch, so a re-sync or a
// corrected sample always leaves the summary matching the raw data.
//
// A sample belongs to the user's local day of its start. Sleep is the
// exception: a night's sleep belongs to the day it ends (the morning the
// user wakes up), which is the day the recovery check-in asks about.
const REBUILD_SQL = `
  WITH s AS (
    SELECT metric, value,
           (CASE WHEN metric = 'sleep_asleep' THEN end_at ELSE start_at END
              AT TIME ZONE $2)::date AS local_date
      FROM health_samples
     WHERE user_id = $1
       AND metric = ANY($5::text[])
       AND start_at >= ($3::date - 1)::timestamp AT TIME ZONE $2
       AND start_at <  ($4::date + 1)::timestamp AT TIME ZONE $2
  ),
  agg AS (
    SELECT local_date,
           AVG(value)  FILTER (WHERE metric = 'resting_heart_rate')          AS resting_hr,
           AVG(value)  FILTER (WHERE metric IN ('hrv_sdnn', 'hrv_rmssd'))    AS hrv_avg_ms,
           SUM(value)  FILTER (WHERE metric = 'sleep_asleep')                AS sleep_mins,
           SUM(value)  FILTER (WHERE metric = 'steps')                       AS steps,
           SUM(value)  FILTER (WHERE metric = 'active_energy')               AS active_kcal,
           AVG(value)  FILTER (WHERE metric = 'heart_rate')                  AS hr_avg,
           MAX(value)  FILTER (WHERE metric = 'heart_rate')                  AS hr_max
      FROM s
     WHERE local_date BETWEEN $3::date AND $4::date
     GROUP BY local_date
  )
  INSERT INTO daily_health_summary
    (user_id, local_date, resting_hr, hrv_avg_ms, sleep_mins, steps,
     active_kcal, hr_avg, hr_max, updated_at)
  SELECT $1, local_date, resting_hr, hrv_avg_ms, ROUND(sleep_mins)::int,
         ROUND(steps)::int, active_kcal, hr_avg, hr_max, NOW()
    FROM agg
  ON CONFLICT (user_id, local_date) DO UPDATE SET
    resting_hr  = EXCLUDED.resting_hr,
    hrv_avg_ms  = EXCLUDED.hrv_avg_ms,
    sleep_mins  = EXCLUDED.sleep_mins,
    steps       = EXCLUDED.steps,
    active_kcal = EXCLUDED.active_kcal,
    hr_avg      = EXCLUDED.hr_avg,
    hr_max      = EXCLUDED.hr_max,
    updated_at  = NOW()
`;

// Resting HR baseline = median daily resting HR over the last 30 days.
// Left unchanged until there are 7 days of data, so one odd night cannot
// set it.
const BASELINE_SQL = `
  UPDATE users u
     SET resting_hr_baseline = b.median
    FROM (
      SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY resting_hr))::int AS median,
             COUNT(*) AS days
        FROM daily_health_summary
       WHERE user_id = $1
         AND resting_hr IS NOT NULL
         AND local_date >= (NOW() AT TIME ZONE $2)::date - $3::int
    ) b
   WHERE u.id = $1 AND b.days >= $4
`;

const { METRIC_NAMES } = require('../config/healthMetrics');

/**
 * Rebuild the daily summary for one user over an inclusive local-date range,
 * then refresh their resting HR baseline.
 * @param {object} db       a pg client (inside a transaction) or the pool
 * @param {number} userId
 * @param {string} timezone IANA zone used to cut days
 * @param {string} fromDate 'YYYY-MM-DD'
 * @param {string} toDate   'YYYY-MM-DD'
 */
const rebuildDailySummary = async (db, userId, timezone, fromDate, toDate) => {
  await db.query(REBUILD_SQL, [userId, timezone, fromDate, toDate, METRIC_NAMES]);
  await db.query(BASELINE_SQL, [userId, timezone, BASELINE_WINDOW_DAYS, BASELINE_MIN_DAYS]);
};

/** The summary row for one local date, or null. */
const getDailySummary = async (db, userId, localDate) => {
  const r = await db.query(
    'SELECT * FROM daily_health_summary WHERE user_id = $1 AND local_date = $2',
    [userId, localDate]
  );
  return r.rows[0] ?? null;
};

module.exports = { rebuildDailySummary, getDailySummary };

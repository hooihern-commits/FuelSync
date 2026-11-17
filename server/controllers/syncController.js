const { DateTime } = require('luxon');
const { z } = require('zod');
const pool = require('../db');
const { WEARABLE_SOURCES } = require('../config/dataSources');
const { HEALTH_METRICS, METRIC_NAMES } = require('../config/healthMetrics');
const { rebuildDailySummary } = require('../services/healthSummary');

// ─────────────────────────────────────────────────────────────
// Wearable sync.
//
// HealthKit and Health Connect are on-device APIs, so the phone reads the
// data and pushes it here in batches. The endpoint is idempotent: the same
// batch sent twice leaves the database exactly as it was after the first
// send, because every record carries the id its source gave it.
// ─────────────────────────────────────────────────────────────
const LIMITS = {
  samples: 5000,          // per batch; the client splits larger backlogs
  workouts: 200,
  planMatchWindowMins: 120, // a synced workout this close to a plan completes it
  maxFutureMins: 24 * 60,   // reject timestamps further ahead than this (clock skew)
};

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO 8601 timestamp');
const recordId = z.string().min(1).max(200);

const sampleSchema = z.object({
  metric: z.enum(METRIC_NAMES),
  value: z.number().finite(),
  start_at: isoDate,
  end_at: isoDate.optional(),
  source_record_id: recordId,
});

const workoutSchema = z.object({
  source_record_id: recordId,
  type: z.string().min(1).max(100),
  start_time: isoDate,
  end_time: isoDate,
  heart_rate_avg: z.number().min(20).max(260).nullish(),
  heart_rate_max: z.number().min(20).max(260).nullish(),
  calories_burned: z.number().min(0).max(20000).nullish(),
});

const anchorKey = z.enum([...METRIC_NAMES, 'workouts']);

const batchSchema = z.object({
  source: z.enum(WEARABLE_SOURCES),
  device_id: z.string().min(1).max(200),
  device: z.string().max(200).nullish(),
  samples: z.array(sampleSchema).max(LIMITS.samples).default([]),
  workouts: z.array(workoutSchema).max(LIMITS.workouts).default([]),
  anchors: z.partialRecord(anchorKey, z.string().max(4096)).default({}),
});

const formatIssues = (error) =>
  error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));

// Checks zod cannot express per-field: value range per metric, time order,
// and timestamps that are not in the future.
const checkSamples = (samples) => {
  const latest = Date.now() + LIMITS.maxFutureMins * 60000;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const def = HEALTH_METRICS[s.metric];
    const start = Date.parse(s.start_at);
    const end = Date.parse(s.end_at ?? s.start_at);
    if (s.value < def.min || s.value > def.max) {
      return { path: `samples.${i}.value`, message: `${s.metric} must be between ${def.min} and ${def.max} ${def.unit}` };
    }
    if (end < start) return { path: `samples.${i}.end_at`, message: 'end_at must not be before start_at' };
    if (end > latest) return { path: `samples.${i}.end_at`, message: 'timestamp is in the future' };
  }
  return null;
};

const checkWorkouts = (workouts) => {
  const latest = Date.now() + LIMITS.maxFutureMins * 60000;
  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i];
    const start = Date.parse(w.start_time);
    const end = Date.parse(w.end_time);
    if (end <= start) return { path: `workouts.${i}.end_time`, message: 'end_time must be after start_time' };
    if (end > latest) return { path: `workouts.${i}.end_time`, message: 'timestamp is in the future' };
  }
  return null;
};

// A source can resend a record inside one batch. Keep the last copy, since
// one INSERT ... ON CONFLICT cannot touch the same row twice.
const dedupeById = (records) => [...new Map(records.map((r) => [r.source_record_id, r])).values()];

const upsertSamples = async (client, { userId, source, device, samples }) => {
  if (samples.length === 0) return { inserted: 0, updated: 0 };
  const cols = { metric: [], value: [], unit: [], start: [], end: [], rid: [] };
  for (const s of samples) {
    cols.metric.push(s.metric);
    cols.value.push(s.value);
    cols.unit.push(HEALTH_METRICS[s.metric].unit);
    cols.start.push(s.start_at);
    cols.end.push(s.end_at ?? s.start_at);
    cols.rid.push(s.source_record_id);
  }
  const r = await client.query(
    `INSERT INTO health_samples
       (user_id, metric, value, unit, start_at, end_at, source, source_record_id, device)
     SELECT $1, t.metric, t.value, t.unit, t.start_at, t.end_at, $2, t.rid, $3
       FROM unnest($4::text[], $5::float8[], $6::text[],
                   $7::timestamptz[], $8::timestamptz[], $9::text[])
            AS t(metric, value, unit, start_at, end_at, rid)
     ON CONFLICT (user_id, source, source_record_id) DO UPDATE SET
       metric   = EXCLUDED.metric,
       value    = EXCLUDED.value,
       unit     = EXCLUDED.unit,
       start_at = EXCLUDED.start_at,
       end_at   = EXCLUDED.end_at,
       device   = EXCLUDED.device
     RETURNING (xmax = 0) AS inserted`,
    [userId, source, device, cols.metric, cols.value, cols.unit, cols.start, cols.end, cols.rid]
  );
  const inserted = r.rows.filter((row) => row.inserted).length;
  return { inserted, updated: r.rows.length - inserted };
};

// One workout from a wearable ends up as exactly one row:
//   1. already synced            -> refresh its stats
//   2. matches a planned workout -> complete that plan
//   3. otherwise                 -> new completed workout
// The user's own RPE and notes are never overwritten.
const upsertWorkout = async (client, { userId, source, device, workout }) => {
  const start = new Date(workout.start_time);
  const end = new Date(workout.end_time);
  const durationMins = Math.round((end - start) / 60000);
  const stats = [
    workout.type, workout.start_time, workout.end_time, durationMins,
    workout.heart_rate_avg != null ? Math.round(workout.heart_rate_avg) : null,
    workout.heart_rate_max != null ? Math.round(workout.heart_rate_max) : null,
    workout.calories_burned ?? null,
  ];

  const existing = await client.query(
    `UPDATE workouts SET
       actual_type = $4, actual_start_time = $5, actual_end_time = $6, duration_mins = $7,
       heart_rate_avg = $8, heart_rate_max = $9, calories_burned = $10,
       device = $11, status = 'completed', updated_at = NOW()
     WHERE user_id = $1 AND data_source = $2 AND source_record_id = $3
     RETURNING id`,
    [userId, source, workout.source_record_id, ...stats, device]
  );
  if (existing.rows.length > 0) return 'updated';

  const planned = await client.query(
    `UPDATE workouts SET
       actual_type = $4, actual_start_time = $5, actual_end_time = $6, duration_mins = $7,
       heart_rate_avg = $8, heart_rate_max = $9, calories_burned = $10,
       device = $11, data_source = $2, source_record_id = $3,
       status = 'completed', updated_at = NOW()
     WHERE id = (
       SELECT id FROM workouts
        WHERE user_id = $1 AND status = 'planned' AND source_record_id IS NULL
          AND planned_time BETWEEN $5::timestamptz - make_interval(mins => $12)
                               AND $5::timestamptz + make_interval(mins => $12)
        ORDER BY ABS(EXTRACT(EPOCH FROM (planned_time - $5::timestamptz)))
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id`,
    [userId, source, workout.source_record_id, ...stats, device, LIMITS.planMatchWindowMins]
  );
  if (planned.rows.length > 0) return 'matched_plan';

  await client.query(
    `INSERT INTO workouts (
       user_id, planned_type, planned_time,
       actual_type, actual_start_time, actual_end_time, duration_mins,
       heart_rate_avg, heart_rate_max, calories_burned,
       device, data_source, source_record_id, status
     ) VALUES ($1, $4, $5, $4, $5, $6, $7, $8, $9, $10, $11, $2, $3, 'completed')
     ON CONFLICT (user_id, data_source, source_record_id)
       WHERE source_record_id IS NOT NULL
     DO UPDATE SET
       actual_type = EXCLUDED.actual_type,
       actual_start_time = EXCLUDED.actual_start_time,
       actual_end_time = EXCLUDED.actual_end_time,
       duration_mins = EXCLUDED.duration_mins,
       heart_rate_avg = EXCLUDED.heart_rate_avg,
       heart_rate_max = EXCLUDED.heart_rate_max,
       calories_burned = EXCLUDED.calories_burned,
       device = EXCLUDED.device,
       updated_at = NOW()`,
    [userId, source, workout.source_record_id, ...stats, device]
  );
  return 'created';
};

const saveAnchors = async (client, { userId, deviceId, source, anchors }) => {
  const metrics = Object.keys(anchors);
  if (metrics.length === 0) return;
  await client.query(
    `INSERT INTO sync_state (user_id, device_id, source, metric, anchor, last_synced_at)
     SELECT $1, $2, $3, t.metric, t.anchor, NOW()
       FROM unnest($4::text[], $5::text[]) AS t(metric, anchor)
     ON CONFLICT (user_id, device_id, source, metric) DO UPDATE SET
       anchor = EXCLUDED.anchor, last_synced_at = NOW()`,
    [userId, deviceId, source, metrics, metrics.map((m) => anchors[m])]
  );
};

// The inclusive range of local days the samples touch.
const localDateRange = (samples, timezone) => {
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    min = Math.min(min, Date.parse(s.start_at));
    max = Math.max(max, Date.parse(s.end_at ?? s.start_at));
  }
  return {
    from: DateTime.fromMillis(min, { zone: timezone }).toISODate(),
    to: DateTime.fromMillis(max, { zone: timezone }).toISODate(),
  };
};

// POST /sync/batch
const syncBatch = async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid sync batch.', issues: formatIssues(parsed.error) });
  }
  const { source, device_id: deviceId, anchors } = parsed.data;
  const device = parsed.data.device ?? null;
  const issue = checkSamples(parsed.data.samples) || checkWorkouts(parsed.data.workouts);
  if (issue) return res.status(400).json({ error: 'Invalid sync batch.', issues: [issue] });

  const samples = dedupeById(parsed.data.samples);
  const workouts = dedupeById(parsed.data.workouts);
  const userId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sampleResult = await upsertSamples(client, { userId, source, device, samples });

    const workoutResult = { created: 0, updated: 0, matched_plan: 0 };
    for (const workout of workouts) {
      const outcome = await upsertWorkout(client, { userId, source, device, workout });
      workoutResult[outcome] += 1;
    }

    let summaryDates = null;
    if (samples.length > 0) {
      summaryDates = localDateRange(samples, req.timezone);
      await rebuildDailySummary(client, userId, req.timezone, summaryDates.from, summaryDates.to);
    }

    // Anchors are saved last and in the same transaction, so a device only
    // moves its cursor forward when the data it covers is stored.
    await saveAnchors(client, { userId, deviceId, source, anchors });

    await client.query('COMMIT');
    res.json({
      samples: { received: parsed.data.samples.length, ...sampleResult },
      workouts: { received: parsed.data.workouts.length, ...workoutResult },
      summary_dates: summaryDates,
      anchors_saved: Object.keys(anchors),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('syncBatch error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

// GET /sync/state?device_id=...&source=...
// The anchors a device should resume from.
const getSyncState = async (req, res) => {
  const { device_id: deviceId, source } = req.query;
  if (typeof deviceId !== 'string' || !deviceId || !WEARABLE_SOURCES.includes(source)) {
    return res.status(400).json({ error: 'device_id and a valid source are required.' });
  }
  try {
    const r = await pool.query(
      `SELECT metric, anchor, last_synced_at FROM sync_state
        WHERE user_id = $1 AND device_id = $2 AND source = $3`,
      [req.user.id, deviceId, source]
    );
    const anchors = {};
    for (const row of r.rows) {
      anchors[row.metric] = { anchor: row.anchor, last_synced_at: row.last_synced_at };
    }
    res.json({ anchors });
  } catch (err) {
    console.error('getSyncState error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /sync/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Daily health summaries for charts and the home screen. Capped at 92 days.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const getDailySummaries = async (req, res) => {
  const today = DateTime.now().setZone(req.timezone);
  const to = typeof req.query.to === 'string' && DATE_RE.test(req.query.to)
    ? req.query.to : today.toISODate();
  const from = typeof req.query.from === 'string' && DATE_RE.test(req.query.from)
    ? req.query.from : DateTime.fromISO(to).minus({ days: 6 }).toISODate();
  if (!DateTime.fromISO(from).isValid || !DateTime.fromISO(to).isValid || from > to) {
    return res.status(400).json({ error: 'from and to must be valid dates, with from on or before to.' });
  }
  if (DateTime.fromISO(to).diff(DateTime.fromISO(from), 'days').days > 92) {
    return res.status(400).json({ error: 'Range is limited to 92 days.' });
  }
  try {
    const r = await pool.query(
      `SELECT to_char(local_date, 'YYYY-MM-DD') AS local_date, resting_hr, hrv_avg_ms,
              sleep_mins, steps, active_kcal, hr_avg, hr_max, updated_at
         FROM daily_health_summary
        WHERE user_id = $1 AND local_date BETWEEN $2 AND $3
        ORDER BY local_date DESC`,
      [req.user.id, from, to]
    );
    res.json({ from, to, days: r.rows });
  } catch (err) {
    console.error('getDailySummaries error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { syncBatch, getSyncState, getDailySummaries, LIMITS };

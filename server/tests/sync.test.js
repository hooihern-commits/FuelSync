const { pool, resetDb, createUser, api, request, app } = require('./helpers');

const SOURCE = 'apple_healthkit';
const DEVICE = 'device-abc';

const hr = (id, at, value = 60) => ({
  metric: 'heart_rate', value, start_at: at, source_record_id: id,
});

const batch = (extra) => ({ source: SOURCE, device_id: DEVICE, ...extra });

const count = async (table, userId) =>
  Number((await pool.query(`SELECT COUNT(*) FROM ${table} WHERE user_id = $1`, [userId])).rows[0].count);

let user;
beforeEach(async () => {
  await resetDb();
  user = await createUser();
});
afterAll(() => pool.end());

describe('POST /v1/sync/batch: samples', () => {
  test('stores samples and reports how many were new', async () => {
    const res = await api(user).post('/v1/sync/batch').send(batch({
      samples: [hr('a', '2026-11-10T08:00:00Z'), hr('b', '2026-11-10T08:00:05Z', 62)],
    }));
    expect(res.status).toBe(200);
    expect(res.body.samples).toEqual({ received: 2, inserted: 2, updated: 0 });
    expect(await count('health_samples', user.id)).toBe(2);
  });

  test('the same batch sent twice stores nothing new', async () => {
    const body = batch({ samples: [hr('a', '2026-11-10T08:00:00Z'), hr('b', '2026-11-10T08:00:05Z')] });
    await api(user).post('/v1/sync/batch').send(body);
    const res = await api(user).post('/v1/sync/batch').send(body);
    expect(res.status).toBe(200);
    expect(res.body.samples).toEqual({ received: 2, inserted: 0, updated: 2 });
    expect(await count('health_samples', user.id)).toBe(2);
  });

  test('a record repeated inside one batch is stored once, last value wins', async () => {
    const res = await api(user).post('/v1/sync/batch').send(batch({
      samples: [hr('a', '2026-11-10T08:00:00Z', 60), hr('a', '2026-11-10T08:00:00Z', 75)],
    }));
    expect(res.status).toBe(200);
    const rows = await pool.query('SELECT value FROM health_samples WHERE user_id = $1', [user.id]);
    expect(rows.rows).toEqual([{ value: 75 }]);
  });

  test('the same record id from two users does not collide', async () => {
    const other = await createUser();
    const body = batch({ samples: [hr('a', '2026-11-10T08:00:00Z')] });
    await api(user).post('/v1/sync/batch').send(body);
    const res = await api(other).post('/v1/sync/batch').send(body);
    expect(res.body.samples.inserted).toBe(1);
  });

  test('accepts a full-size batch of 5000 samples', async () => {
    const start = Date.parse('2026-11-10T00:00:00Z');
    const samples = Array.from({ length: 5000 }, (_, i) =>
      hr(`s${i}`, new Date(start + i * 5000).toISOString(), 60 + (i % 40)));
    const res = await api(user).post('/v1/sync/batch').send(batch({ samples }));
    expect(res.status).toBe(200);
    expect(res.body.samples.inserted).toBe(5000);
  });

  test('rejects a batch over the sample limit', async () => {
    const samples = Array.from({ length: 5001 }, (_, i) => hr(`s${i}`, '2026-11-10T08:00:00Z'));
    const res = await api(user).post('/v1/sync/batch').send(batch({ samples }));
    expect(res.status).toBe(400);
  });

  test.each([
    ['unknown metric', { samples: [{ metric: 'blood_type', value: 1, start_at: '2026-11-10T08:00:00Z', source_record_id: 'a' }] }],
    ['value out of range', { samples: [hr('a', '2026-11-10T08:00:00Z', 900)] }],
    ['bad timestamp', { samples: [hr('a', 'yesterday')] }],
    ['end before start', { samples: [{ metric: 'steps', value: 10, start_at: '2026-11-10T09:00:00Z', end_at: '2026-11-10T08:00:00Z', source_record_id: 'a' }] }],
    ['far-future timestamp', { samples: [hr('a', '2099-01-01T00:00:00Z')] }],
    ['manual is not a sync source', { source: 'manual', samples: [] }],
    ['missing device_id', { device_id: undefined, samples: [] }],
  ])('rejects %s and stores nothing', async (_name, extra) => {
    const res = await api(user).post('/v1/sync/batch').send(batch(extra));
    expect(res.status).toBe(400);
    expect(res.body.issues.length).toBeGreaterThan(0);
    expect(await count('health_samples', user.id)).toBe(0);
  });

  test('requires a token', async () => {
    const res = await request(app).post('/v1/sync/batch').send(batch({ samples: [] }));
    expect(res.status).toBe(401);
  });
});

describe('daily summary', () => {
  const day = [
    { metric: 'resting_heart_rate', value: 52, start_at: '2026-11-10T06:00:00Z', source_record_id: 'rhr' },
    { metric: 'hrv_sdnn', value: 60, start_at: '2026-11-10T03:00:00Z', source_record_id: 'hrv1' },
    { metric: 'hrv_sdnn', value: 80, start_at: '2026-11-10T04:00:00Z', source_record_id: 'hrv2' },
    { metric: 'steps', value: 4000, start_at: '2026-11-10T08:00:00Z', end_at: '2026-11-10T09:00:00Z', source_record_id: 'st1' },
    { metric: 'steps', value: 2500, start_at: '2026-11-10T12:00:00Z', end_at: '2026-11-10T13:00:00Z', source_record_id: 'st2' },
    { metric: 'active_energy', value: 320.5, start_at: '2026-11-10T08:00:00Z', end_at: '2026-11-10T09:00:00Z', source_record_id: 'ae' },
    { metric: 'heart_rate', value: 100, start_at: '2026-11-10T08:10:00Z', source_record_id: 'hr1' },
    { metric: 'heart_rate', value: 160, start_at: '2026-11-10T08:20:00Z', source_record_id: 'hr2' },
    // Sleep that starts on the 9th and ends on the 10th counts for the 10th.
    { metric: 'sleep_asleep', value: 420, start_at: '2026-11-09T22:30:00Z', end_at: '2026-11-10T05:30:00Z', source_record_id: 'sl' },
  ];

  test('rolls samples up into one row per day', async () => {
    const res = await api(user).post('/v1/sync/batch').send(batch({ samples: day }));
    expect(res.body.summary_dates).toEqual({ from: '2026-11-09', to: '2026-11-10' });

    const summary = await api(user).get('/v1/sync/summary?from=2026-11-09&to=2026-11-10');
    expect(summary.status).toBe(200);
    expect(summary.body.days).toHaveLength(1);
    const row = summary.body.days[0];
    expect(row.local_date).toBe('2026-11-10');
    expect(Number(row.resting_hr)).toBe(52);
    expect(Number(row.hrv_avg_ms)).toBe(70);
    expect(row.steps).toBe(6500);
    expect(Number(row.active_kcal)).toBe(320.5);
    expect(Number(row.hr_avg)).toBe(130);
    expect(Number(row.hr_max)).toBe(160);
    expect(row.sleep_mins).toBe(420);
  });

  test('re-syncing does not double the totals', async () => {
    await api(user).post('/v1/sync/batch').send(batch({ samples: day }));
    await api(user).post('/v1/sync/batch').send(batch({ samples: day }));
    const summary = await api(user).get('/v1/sync/summary?from=2026-11-10&to=2026-11-10');
    expect(summary.body.days[0].steps).toBe(6500);
  });

  test('a later batch for the same day adds to the totals', async () => {
    await api(user).post('/v1/sync/batch').send(batch({ samples: day }));
    await api(user).post('/v1/sync/batch').send(batch({
      samples: [{ metric: 'steps', value: 500, start_at: '2026-11-10T18:00:00Z', end_at: '2026-11-10T18:30:00Z', source_record_id: 'st3' }],
    }));
    const summary = await api(user).get('/v1/sync/summary?from=2026-11-10&to=2026-11-10');
    expect(summary.body.days[0].steps).toBe(7000);
    expect(Number(summary.body.days[0].resting_hr)).toBe(52);
  });

  test('days are cut in the user timezone', async () => {
    // 17:00 UTC on the 10th is 01:00 on the 11th in Singapore.
    await api(user, 'Asia/Singapore').post('/v1/sync/batch').send(batch({
      samples: [{ metric: 'steps', value: 900, start_at: '2026-11-10T17:00:00Z', end_at: '2026-11-10T17:30:00Z', source_record_id: 'st' }],
    }));
    const summary = await api(user, 'Asia/Singapore').get('/v1/sync/summary?from=2026-11-10&to=2026-11-11');
    expect(summary.body.days.map((d) => [d.local_date, d.steps])).toEqual([['2026-11-11', 900]]);
  });

  test('resting HR baseline is the median once there are 7 days of data', async () => {
    const today = new Date();
    const dayAt = (n) => new Date(today.getTime() - n * 86400000).toISOString();
    const rhr = (n, value) => ({ metric: 'resting_heart_rate', value, start_at: dayAt(n), source_record_id: `rhr${n}` });

    await api(user).post('/v1/sync/batch').send(batch({ samples: [1, 2, 3, 4, 5, 6].map((n) => rhr(n, 50 + n)) }));
    let u = await pool.query('SELECT resting_hr_baseline FROM users WHERE id = $1', [user.id]);
    expect(u.rows[0].resting_hr_baseline).toBeNull();

    await api(user).post('/v1/sync/batch').send(batch({ samples: [rhr(7, 57)] }));
    u = await pool.query('SELECT resting_hr_baseline FROM users WHERE id = $1', [user.id]);
    expect(u.rows[0].resting_hr_baseline).toBe(54); // median of 51..57
  });
});

describe('POST /v1/sync/batch: workouts', () => {
  const run = (extra = {}) => ({
    source_record_id: 'w1', type: 'running',
    start_time: '2026-11-10T08:00:00Z', end_time: '2026-11-10T08:45:00Z',
    heart_rate_avg: 151.6, heart_rate_max: 178, calories_burned: 520,
    ...extra,
  });

  test('creates a completed workout, then updates it on re-sync', async () => {
    const first = await api(user).post('/v1/sync/batch').send(batch({ workouts: [run()] }));
    expect(first.body.workouts).toMatchObject({ created: 1, updated: 0, matched_plan: 0 });

    const second = await api(user).post('/v1/sync/batch').send(batch({ workouts: [run({ calories_burned: 540 })] }));
    expect(second.body.workouts).toMatchObject({ created: 0, updated: 1, matched_plan: 0 });

    const rows = (await pool.query('SELECT * FROM workouts WHERE user_id = $1', [user.id])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'completed', data_source: SOURCE, source_record_id: 'w1',
      actual_type: 'running', duration_mins: 45, heart_rate_avg: 152, heart_rate_max: 178,
    });
    expect(Number(rows[0].calories_burned)).toBe(540);
  });

  test('completes a planned workout close in time instead of adding a row', async () => {
    const planned = await api(user).post('/v1/workouts').send({
      planned_type: 'running', planned_time: '2026-11-10T07:30:00Z', planned_rpe: 7,
    });
    const res = await api(user).post('/v1/sync/batch').send(batch({ workouts: [run()] }));
    expect(res.body.workouts).toMatchObject({ created: 0, matched_plan: 1 });

    const rows = (await pool.query('SELECT * FROM workouts WHERE user_id = $1', [user.id])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: planned.body.workout.id, status: 'completed', planned_rpe: 7,
      data_source: SOURCE, source_record_id: 'w1',
    });

    // And the next sync recognises it as the same workout.
    const again = await api(user).post('/v1/sync/batch').send(batch({ workouts: [run()] }));
    expect(again.body.workouts).toMatchObject({ created: 0, updated: 1, matched_plan: 0 });
  });

  test('leaves a planned workout far from the synced one alone', async () => {
    await api(user).post('/v1/workouts').send({
      planned_type: 'running', planned_time: '2026-11-10T18:00:00Z', planned_rpe: 7,
    });
    const res = await api(user).post('/v1/sync/batch').send(batch({ workouts: [run()] }));
    expect(res.body.workouts).toMatchObject({ created: 1, matched_plan: 0 });
    expect(await count('workouts', user.id)).toBe(2);
  });

  test('a synced workout keeps its source when the user adds RPE by hand', async () => {
    await api(user).post('/v1/sync/batch').send(batch({ workouts: [run()] }));
    const id = (await pool.query('SELECT id FROM workouts WHERE user_id = $1', [user.id])).rows[0].id;
    const patch = await api(user).patch(`/v1/workouts/${id}`).send({
      actual_type: 'running', actual_start_time: '2026-11-10T08:00:00Z',
      actual_end_time: '2026-11-10T08:45:00Z', actual_rpe: 8, data_source: 'manual',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.workout).toMatchObject({ actual_rpe: 8, data_source: SOURCE });

    await api(user).post('/v1/sync/batch').send(batch({ workouts: [run()] }));
    const rows = (await pool.query('SELECT actual_rpe FROM workouts WHERE user_id = $1', [user.id])).rows;
    expect(rows).toEqual([{ actual_rpe: 8 }]);
  });

  test('rejects a workout that ends before it starts', async () => {
    const res = await api(user).post('/v1/sync/batch').send(batch({
      workouts: [run({ end_time: '2026-11-10T07:00:00Z' })],
    }));
    expect(res.status).toBe(400);
  });
});

describe('sync anchors', () => {
  test('anchors are saved with the batch and returned per device', async () => {
    await api(user).post('/v1/sync/batch').send(batch({
      samples: [hr('a', '2026-11-10T08:00:00Z')],
      anchors: { heart_rate: 'anchor-1', workouts: 'anchor-w' },
    }));
    await api(user).post('/v1/sync/batch').send(batch({ anchors: { heart_rate: 'anchor-2' } }));

    const state = await api(user).get(`/v1/sync/state?device_id=${DEVICE}&source=${SOURCE}`);
    expect(state.status).toBe(200);
    expect(state.body.anchors.heart_rate.anchor).toBe('anchor-2');
    expect(state.body.anchors.workouts.anchor).toBe('anchor-w');

    const other = await api(user).get(`/v1/sync/state?device_id=other&source=${SOURCE}`);
    expect(other.body.anchors).toEqual({});
  });

  test('a rejected batch does not move the anchor', async () => {
    await api(user).post('/v1/sync/batch').send(batch({ anchors: { heart_rate: 'anchor-1' } }));
    await api(user).post('/v1/sync/batch').send(batch({
      samples: [hr('a', 'not-a-date')], anchors: { heart_rate: 'anchor-2' },
    }));
    const state = await api(user).get(`/v1/sync/state?device_id=${DEVICE}&source=${SOURCE}`);
    expect(state.body.anchors.heart_rate.anchor).toBe('anchor-1');
  });
});

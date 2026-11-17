const { pool, resetDb, createUser, api, request, app } = require('./helpers');

let user;
beforeEach(async () => {
  await resetDb();
  user = await createUser();
});
afterAll(() => pool.end());

const logBody = (extra = {}) => ({
  actual_type: 'cycling',
  actual_start_time: '2026-11-10T08:00:00Z',
  actual_end_time: '2026-11-10T09:00:00Z',
  actual_rpe: 6,
  ...extra,
});

describe('routing', () => {
  test('the API answers at /v1 and at the root', async () => {
    expect((await api(user).get('/v1/workouts')).status).toBe(200);
    expect((await api(user).get('/workouts')).status).toBe(200);
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
  });

  test('malformed JSON gets a 400, not a 500', async () => {
    const res = await request(app).post('/v1/auth/login')
      .set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
  });

  test('an oversized body on a normal route gets a 413', async () => {
    const res = await api(user).post('/v1/meals').send({ meal_name: 'x', notes: 'a'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe('POST /v1/workouts/log', () => {
  test('a manual workout with no record id is stored each time', async () => {
    await api(user).post('/v1/workouts/log').send(logBody());
    await api(user).post('/v1/workouts/log').send(logBody());
    const rows = await pool.query('SELECT id FROM workouts WHERE user_id = $1', [user.id]);
    expect(rows.rows).toHaveLength(2);
  });

  test('a workout with a source record id is stored once', async () => {
    const body = logBody({ data_source: 'health_connect', source_record_id: 'hc-1' });
    const first = await api(user).post('/v1/workouts/log').send(body);
    const second = await api(user).post('/v1/workouts/log').send({ ...body, calories_burned: 400 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.workout.id).toBe(first.body.workout.id);
    expect(second.body.workout).not.toHaveProperty('inserted');
    const rows = await pool.query('SELECT calories_burned FROM workouts WHERE user_id = $1', [user.id]);
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0].calories_burned)).toBe(400);
  });

  test('accepts a source added without a migration and rejects an unknown one', async () => {
    const ok = await api(user).post('/v1/workouts/log').send(logBody({ data_source: 'garmin' }));
    expect(ok.status).toBe(201);
    const bad = await api(user).post('/v1/workouts/log').send(logBody({ data_source: 'smart_fridge' }));
    expect(bad.status).toBe(400);
  });
});

describe('pagination', () => {
  const addMeals = async (n) => {
    for (let i = 0; i < n; i++) {
      await api(user).post('/v1/meals').send({
        meal_name: `meal ${i}`, logged_at: `2026-11-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
      });
    }
  };

  test('with no limit every row comes back, as before', async () => {
    await addMeals(5);
    const res = await api(user).get('/v1/meals');
    expect(res.body.meals).toHaveLength(5);
    expect(res.body.next_before).toBeNull();
  });

  test('limit and before walk the list newest first without gaps or repeats', async () => {
    await addMeals(5);
    const seen = [];
    let url = '/v1/meals?limit=2';
    for (let page = 0; page < 5; page++) {
      const res = await api(user).get(url);
      seen.push(...res.body.meals.map((m) => m.meal_name));
      if (!res.body.next_before) break;
      url = `/v1/meals?limit=2&before=${encodeURIComponent(res.body.next_before)}`;
    }
    expect(seen).toEqual(['meal 4', 'meal 3', 'meal 2', 'meal 1', 'meal 0']);
  });

  test('workouts page the same way', async () => {
    for (const day of ['10', '11', '12']) {
      await api(user).post('/v1/workouts').send({
        planned_type: 'running', planned_time: `2026-11-${day}T08:00:00Z`, planned_rpe: 5,
      });
    }
    const first = await api(user).get('/v1/workouts?limit=2');
    expect(first.body.workouts).toHaveLength(2);
    const rest = await api(user).get(`/v1/workouts?limit=2&before=${encodeURIComponent(first.body.next_before)}`);
    expect(rest.body.workouts).toHaveLength(1);
    expect(rest.body.next_before).toBeNull();
  });

  test.each(['0', '201', 'abc', '1.5'])('rejects limit=%s', async (limit) => {
    const res = await api(user).get(`/v1/meals?limit=${limit}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/recovery', () => {
  const checkin = (workoutId, extra = {}) => ({
    workout_id: workoutId, energy_level: 4, muscle_soreness: 4, sleep_quality: 4, overall_feeling: 4,
    ...extra,
  });
  const newWorkout = async (as = user) =>
    (await api(as).post('/v1/workouts/log').send(logBody())).body.workout.id;

  test('with no wearable data the objective part stays neutral', async () => {
    const id = await newWorkout();
    const res = await api(user).post('/v1/recovery').send(checkin(id));
    expect(res.status).toBe(201);
    expect(res.body.recovery_score).toBe(68); // 48 subjective + 20 neutral
    expect(res.body.checkin.resting_hr).toBeNull();
  });

  test("fills resting HR, HRV and sleep from today's wearable summary", async () => {
    const id = await newWorkout();
    const now = new Date().toISOString();
    await api(user).post('/v1/sync/batch').send({
      source: 'apple_healthkit', device_id: 'd1',
      samples: [
        { metric: 'resting_heart_rate', value: 50, start_at: now, source_record_id: 'r' },
        { metric: 'hrv_sdnn', value: 80, start_at: now, source_record_id: 'h' },
        { metric: 'sleep_asleep', value: 450, start_at: new Date(Date.now() - 450 * 60000).toISOString(), end_at: now, source_record_id: 's' },
      ],
    });
    const res = await api(user).post('/v1/recovery').send(checkin(id));
    expect(res.status).toBe(201);
    expect(res.body.checkin.resting_hr).toBe(50);
    expect(Number(res.body.checkin.hrv_score)).toBe(80);
    expect(Number(res.body.checkin.sleep_duration_hrs)).toBe(7.5);
    // 48 subjective + 20 (resting HR at baseline) + 16 (HRV 80 / 5)
    expect(res.body.recovery_score).toBe(84);
  });

  test("cannot attach a check-in to another user's workout", async () => {
    const other = await createUser();
    const id = await newWorkout(other);
    const res = await api(user).post('/v1/recovery').send(checkin(id));
    expect(res.status).toBe(404);
  });
});

describe('suggestions', () => {
  test('fall back to the rule engine when the ML service is down', async () => {
    const planned = await api(user).post('/v1/workouts').send({
      planned_type: 'running', planned_time: '2026-11-10T08:00:00Z', planned_rpe: 8,
    });
    const res = await api(user).post('/v1/suggestions/pre').send({ workout_id: planned.body.workout.id });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rule');
    expect(res.body.suggested_carbs).toBe(70);
  });
});

describe('schema', () => {
  test('the per-user indexes exist', async () => {
    const r = await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
    const names = r.rows.map((row) => row.indexname);
    for (const name of [
      'idx_meals_user_logged', 'idx_workouts_user_planned', 'idx_workouts_user_status',
      'idx_suggestions_user_created', 'idx_recovery_user_date', 'uq_workouts_source_record',
      'idx_health_samples_user_metric_start',
    ]) {
      expect(names).toContain(name);
    }
  });

  test('workouts.data_source no longer has a CHECK list', async () => {
    const r = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'workouts'::regclass AND contype = 'c'`
    );
    expect(r.rows.some((row) => /data_source/.test(row.def))).toBe(false);
  });
});

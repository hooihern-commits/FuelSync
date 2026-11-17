"""The training query: one row per (workout, phase), weight as of the workout."""
from conftest import needs_db

pytestmark = needs_db


def _user(cur, email, goal="maintain"):
    cur.execute(
        "INSERT INTO users (name, email, password, goal) VALUES ('T', %s, 'x', %s) RETURNING id",
        (email, goal),
    )
    return cur.fetchone()[0]


def _labelled_workout(cur, user_id, start, carbs, recovery):
    """A completed workout with post advice, one linked meal and a check-in."""
    cur.execute(
        """INSERT INTO workouts (user_id, planned_type, planned_time, planned_rpe,
                                 actual_type, actual_start_time, actual_end_time,
                                 duration_mins, actual_rpe, status)
           VALUES (%s, 'running', %s, 7, 'running', %s, %s::timestamptz + interval '45 min',
                   45, 7, 'completed') RETURNING id""",
        (user_id, start, start, start),
    )
    workout_id = cur.fetchone()[0]
    cur.execute(
        """INSERT INTO suggestions (user_id, workout_id, phase, suggestion_text)
           VALUES (%s, %s, 'post', 'eat') RETURNING id""",
        (user_id, workout_id),
    )
    suggestion_id = cur.fetchone()[0]
    cur.execute(
        """INSERT INTO meals (user_id, meal_name, carbs_g, protein_g, fat_g, suggestion_id)
           VALUES (%s, 'meal', %s, 30, 10, %s)""",
        (user_id, carbs, suggestion_id),
    )
    cur.execute(
        """INSERT INTO recovery_checkins (user_id, workout_id, energy_level, muscle_soreness,
                                          sleep_quality, overall_feeling, recovery_score)
           VALUES (%s, %s, 4, 4, 4, 4, %s)""",
        (user_id, workout_id, recovery),
    )
    return workout_id


def test_identical_workouts_stay_separate_rows(conn):
    import db

    with conn.cursor() as cur:
        user_id = _user(cur, "a@example.com")
        # Same type, RPE, duration and recovery score: the old query, which
        # grouped by those columns, merged these into one row and summed
        # their meals.
        _labelled_workout(cur, user_id, "2026-11-01T08:00:00Z", carbs=80, recovery=70)
        _labelled_workout(cur, user_id, "2026-11-03T08:00:00Z", carbs=80, recovery=70)

    frame = db.load_training_frame()
    assert len(frame) == 2
    assert sorted(frame["carbs_g"].tolist()) == [80.0, 80.0]


def test_weight_is_the_reading_at_workout_time(conn):
    import db

    with conn.cursor() as cur:
        user_id = _user(cur, "b@example.com")
        cur.execute(
            """INSERT INTO body_metrics (user_id, weight_kg, logged_at) VALUES
               (%s, 80, '2026-10-01T00:00:00Z'), (%s, 72, '2026-11-10T00:00:00Z')""",
            (user_id, user_id),
        )
        _labelled_workout(cur, user_id, "2026-10-15T08:00:00Z", carbs=80, recovery=70)

    frame = db.load_training_frame()
    # 80 kg at the time of the workout, not the 72 kg logged a month later.
    assert frame["weight"].tolist() == [80.0]
    assert frame["carbs_per_kg"].tolist() == [1.0]


def test_weight_falls_back_to_the_first_later_reading(conn):
    import db

    with conn.cursor() as cur:
        user_id = _user(cur, "c@example.com")
        cur.execute(
            "INSERT INTO body_metrics (user_id, weight_kg, logged_at) VALUES (%s, 75, '2026-11-20T00:00:00Z')",
            (user_id,),
        )
        _labelled_workout(cur, user_id, "2026-10-15T08:00:00Z", carbs=80, recovery=70)

    assert db.load_training_frame()["weight"].tolist() == [75.0]

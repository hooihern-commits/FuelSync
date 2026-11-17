"""Model storage in ml_models, the retrain lock, and the service picking up
stored versions."""
import io

import joblib
from conftest import needs_db

pytestmark = needs_db


def test_training_publishes_a_version_that_loads_back(conn):
    import db
    from train_recovery_model import train

    assert db.latest_model_meta() is None
    metrics = train()

    stored = db.load_latest_model()
    assert stored is not None
    model_id, artifact, stored_metrics = stored
    assert stored_metrics["n_seed_rows"] == metrics["n_seed_rows"]
    model = joblib.load(io.BytesIO(artifact))
    assert hasattr(model, "predict")
    assert db.latest_model_meta()[0] == model_id


def test_old_versions_are_pruned(conn):
    import db

    ids = [db.save_model(b"model-%d" % i, {"i": i}) for i in range(4)]
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM ml_models ORDER BY id")
        kept = [r[0] for r in cur.fetchall()]
    assert kept == ids[-2:]  # MODEL_KEEP_VERSIONS=2 in conftest
    assert db.load_latest_model()[1] == b"model-3"


def test_only_one_holder_of_the_retrain_lock(conn):
    import db

    with db.retrain_lock() as first:
        assert first is True
        with db.retrain_lock() as second:
            assert second is False
    with db.retrain_lock() as again:
        assert again is True


def test_service_serves_the_stored_model_and_picks_up_a_newer_one(conn):
    import db
    import serve
    from fastapi.testclient import TestClient
    from train_recovery_model import train

    train()
    first_id = db.latest_model_meta()[0]

    with TestClient(serve.app) as client:
        health = client.get("/health").json()
        assert health["model_loaded"] is True
        assert health["model_version"] == first_id

        rec = client.post("/recommend", json={
            "phase": "post", "workout_type": "running", "rpe": 8,
            "duration_mins": 60, "weight": 70, "goal": "maintain",
        })
        assert rec.status_code == 200
        assert rec.json()["source"] == "ml"

        # Another replica (or the scheduled job) publishes a new version.
        train()
        second_id = db.latest_model_meta()[0]
        assert second_id != first_id
        serve._refresh_if_newer()
        assert client.get("/health").json()["model_version"] == second_id


def test_scheduled_retrain_only_runs_when_due(conn, monkeypatch):
    import db
    import serve

    calls = []
    monkeypatch.setattr(serve, "_train_in_subprocess", lambda: calls.append(1) or False)

    # Nothing stored yet: due.
    serve._retrain_and_reload(force=False)
    assert len(calls) == 1

    # A fresh version exists: not due, so the trainer is not started.
    db.save_model(b"fresh", {})
    serve._retrain_and_reload(force=False)
    assert len(calls) == 1

    # A version older than the interval: due again.
    with conn.cursor() as cur:
        cur.execute("UPDATE ml_models SET created_at = NOW() - interval '2 days'")
    serve._retrain_and_reload(force=False)
    assert len(calls) == 2

    # Forced: runs regardless of age.
    db.save_model(b"fresh-again", {})
    serve._retrain_and_reload(force=True)
    assert len(calls) == 3

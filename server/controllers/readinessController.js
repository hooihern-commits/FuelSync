const { DateTime } = require('luxon');
const pool = require('../db');

// ─────────────────────────────────────────────────────────────
// Workout Readiness — a forward-looking "how ready to train today"
// score (0–100) derived entirely from data FuelSync already owns:
//   Recovery  (50%) — latest recovery check-in
//   Fueling   (25%) — protein intake over the last 24h vs bodyweight
//   Freshness (25%) — session-RPE training load over the last 72h
// All constants live here so the standard is easy to tune.
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  weights:               { recovery: 0.50, fueling: 0.25, freshness: 0.25 },
  proteinTargetPerKg:    1.6,   // g/kg/day — evidence-based for active people
  lowCalFloor:           800,   // kcal in 24h below which fueling is penalised
  lowCalPenalty:         0.7,   // multiplier applied when under the floor
  recoveryStaleDays:     2,     // check-ins older than this fall back to neutral
  neutralRecovery:       60,    // used when no fresh check-in exists
  neutralFueling:        70,    // used when weight or meals are unavailable
  freshnessLoadDivisor:  12,    // load AU per point lost (600 AU ≈ 50pt drop)
  loadWindowHours:       72,
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function bandFor(score) {
  if (score >= 80) return { band: 'prime',    label: 'Prime — go hard' };
  if (score >= 65) return { band: 'ready',    label: 'Ready' };
  if (score >= 50) return { band: 'moderate', label: 'Moderate — ease off' };
  if (score >= 35) return { band: 'low',      label: 'Low — keep it light' };
  return { band: 'rest', label: 'Rest' };
}

// GET /readiness/today
const getTodayReadiness = async (req, res) => {
  const userId = req.user.id;
  try {
    const [recoveryRes, fuelRes, weightRes, loadRes] = await Promise.all([
      pool.query(
        `SELECT recovery_score, checkin_date
           FROM recovery_checkins
          WHERE user_id = $1
          ORDER BY checkin_date DESC, created_at DESC
          LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(protein_g), 0)   AS protein,
                COALESCE(SUM(calories_kcal), 0) AS calories,
                COUNT(*)                        AS meal_count
           FROM meals
          WHERE user_id = $1
            AND logged_at >= NOW() - INTERVAL '24 hours'`,
        [userId]
      ),
      pool.query(
        `SELECT weight_kg FROM body_metrics
          WHERE user_id = $1 AND weight_kg IS NOT NULL
          ORDER BY logged_at DESC LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT actual_rpe, duration_mins,
                COALESCE(actual_end_time, actual_start_time) AS at
           FROM workouts
          WHERE user_id = $1 AND status = 'completed'
            AND actual_rpe IS NOT NULL AND duration_mins IS NOT NULL
            AND COALESCE(actual_end_time, actual_start_time)
                >= NOW() - INTERVAL '${CONFIG.loadWindowHours} hours'`,
        [userId]
      ),
    ]);

    // ── Recovery sub-score ──
    let recoveryScore = CONFIG.neutralRecovery;
    let recoveryStale = true;
    let recoveryNote = 'No recent check-in — using a neutral baseline.';
    const recRow = recoveryRes.rows[0];
    if (recRow) {
      const todayISO = DateTime.now().setZone(req.timezone).toISODate();
      const cd = recRow.checkin_date;
      const cdISO = cd instanceof Date ? cd.toISOString().slice(0, 10) : String(cd).slice(0, 10);
      const ageDays = DateTime.fromISO(todayISO).diff(DateTime.fromISO(cdISO), 'days').days;
      if (ageDays <= CONFIG.recoveryStaleDays) {
        recoveryScore = Number(recRow.recovery_score);
        recoveryStale = false;
        recoveryNote = null;
      } else {
        recoveryNote = `Last check-in was ${Math.round(ageDays)} days ago — check in for an accurate score.`;
      }
    }

    // ── Fueling sub-score ──
    const protein24h = Number(fuelRes.rows[0].protein);
    const calories24h = Number(fuelRes.rows[0].calories);
    const mealCount = Number(fuelRes.rows[0].meal_count);
    const weightKg = weightRes.rows[0]?.weight_kg != null
      ? Number(weightRes.rows[0].weight_kg)
      : null;

    let fuelingScore, fuelingNote, proteinTarget = null;
    if (mealCount === 0) {
      fuelingScore = CONFIG.neutralFueling;
      fuelingNote = 'No meals logged in 24h — log meals for accurate fueling.';
    } else if (weightKg == null) {
      fuelingScore = CONFIG.neutralFueling;
      fuelingNote = 'Add your bodyweight to score fueling accurately.';
    } else {
      proteinTarget = CONFIG.proteinTargetPerKg * weightKg;
      fuelingScore = clamp((protein24h / proteinTarget) * 100);
      if (calories24h < CONFIG.lowCalFloor) {
        fuelingScore = clamp(fuelingScore * CONFIG.lowCalPenalty);
        fuelingNote = `Under-fuelled — only ${Math.round(calories24h)} kcal in 24h.`;
      } else if (protein24h < proteinTarget) {
        fuelingNote = `${Math.round(proteinTarget - protein24h)}g short of your protein target.`;
      } else {
        fuelingNote = 'Well fuelled.';
      }
    }

    // ── Freshness sub-score (session-RPE load, recency-weighted) ──
    const now = DateTime.now();
    let weightedLoad = 0;
    for (const w of loadRes.rows) {
      const hoursAgo = now.diff(DateTime.fromJSDate(w.at), 'hours').hours;
      const recency = 1 - Math.min(hoursAgo, CONFIG.loadWindowHours) / CONFIG.loadWindowHours * 0.5; // 1.0 → 0.5
      weightedLoad += Number(w.actual_rpe) * Number(w.duration_mins) * recency;
    }
    const freshnessScore = clamp(100 - weightedLoad / CONFIG.freshnessLoadDivisor);
    const freshnessNote = loadRes.rows.length === 0
      ? 'No hard sessions recently — fully fresh.'
      : `${loadRes.rows.length} session${loadRes.rows.length > 1 ? 's' : ''} in the last 72h.`;

    // ── Composite ──
    const w = CONFIG.weights;
    const score = Math.round(
      w.recovery * recoveryScore + w.fueling * fuelingScore + w.freshness * freshnessScore
    );
    const { band, label } = bandFor(score);

    res.json({
      readiness: {
        score,
        band,
        label,
        breakdown: {
          recovery:  { score: Math.round(recoveryScore),  weight: w.recovery,  stale: recoveryStale, note: recoveryNote },
          fueling:   { score: Math.round(fuelingScore),   weight: w.fueling,   protein_g: Math.round(protein24h), target_g: proteinTarget ? Math.round(proteinTarget) : null, note: fuelingNote },
          freshness: { score: Math.round(freshnessScore), weight: w.freshness, load: Math.round(weightedLoad), note: freshnessNote },
        },
      },
    });
  } catch (err) {
    console.error('getTodayReadiness error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { getTodayReadiness };

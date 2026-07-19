// Thin client for the FuelSync ML nutrition service (ml_nutrition/serve.py).
//
// getRecommendation() POSTs a workout context and returns the model's macro
// recommendation. If the service is unreachable, slow, or reports itself
// "cold" (source: "rule"), the caller falls back to the local rule engine, so
// suggestions never hard-depend on the Python service being up.

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
const ML_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || '2500', 10);

/**
 * Ask the ML service for a recommendation.
 * @param {object} payload - { phase, workout_type, rpe, duration_mins,
 *   heart_rate_avg, calories_burned, weight, goal,
 *   avg_carbs, avg_protein, avg_fats, n_meals }
 * @returns {Promise<object|null>} recommendation, or null if unavailable.
 */
const getRecommendation = async (payload) => {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[mlClient] service responded ${res.status}; using fallback`);
      return null;
    }
    return await res.json();
  } catch (err) {
    // Timeout, connection refused, service down — all non-fatal.
    console.warn(`[mlClient] ML service unavailable (${err.name}); using fallback`);
    return null;
  }
};

/**
 * Fire-and-forget: tell the ML service to retrain on the latest data.
 * Called after a recovery check-in (a new training label) is saved, so the
 * model continually regresses toward real users. Never throws; failures are
 * logged and ignored so they can't affect the request that triggered them.
 */
const triggerRetrain = () => {
  fetch(`${ML_SERVICE_URL}/retrain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
  }).catch((err) => {
    console.warn(`[mlClient] retrain trigger failed (${err.name}); ignored`);
  });
};

module.exports = { getRecommendation, triggerRetrain };

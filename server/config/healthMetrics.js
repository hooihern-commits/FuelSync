// Health sample types the sync endpoint accepts, with the one unit each is
// stored in. The client converts to this unit before upload, so every row of
// a metric is comparable.
//
//   point    a reading at one instant (start_at = end_at)
//   interval a total over a span (start_at..end_at)
const HEALTH_METRICS = {
  heart_rate:         { unit: 'bpm',   kind: 'point',    min: 20, max: 260 },
  resting_heart_rate: { unit: 'bpm',   kind: 'point',    min: 20, max: 150 },
  hrv_sdnn:           { unit: 'ms',    kind: 'point',    min: 0,  max: 500 },
  hrv_rmssd:          { unit: 'ms',    kind: 'point',    min: 0,  max: 500 },
  steps:              { unit: 'count', kind: 'interval', min: 0,  max: 200000 },
  active_energy:      { unit: 'kcal',  kind: 'interval', min: 0,  max: 20000 },
  // Minutes asleep in the span, any sleep stage. Time awake in bed is not sent.
  sleep_asleep:       { unit: 'min',   kind: 'interval', min: 0,  max: 1440 },
};

const METRIC_NAMES = Object.keys(HEALTH_METRICS);

module.exports = { HEALTH_METRICS, METRIC_NAMES };

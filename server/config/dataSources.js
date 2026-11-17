// Where a workout, meal or health sample came from. This list replaces the
// CHECK constraint that used to live on workouts.data_source, so adding a
// wearable is a one-line change here and needs no migration.
const DATA_SOURCES = [
  'manual',
  'apple_healthkit',
  'health_connect',
  'garmin',
  'fitbit',
  'oura',
  'whoop',
];

// Sources that can be synced from a device. 'manual' is entered by hand.
const WEARABLE_SOURCES = DATA_SOURCES.filter((s) => s !== 'manual');

const isDataSource = (s) => DATA_SOURCES.includes(s);

module.exports = { DATA_SOURCES, WEARABLE_SOURCES, isDataSource };

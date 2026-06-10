import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';
import api from '../../src/api/client';

type Mode = 'plan' | 'log' | 'update';

const WORKOUT_TYPES = [
  { label: 'Running',    value: 'running'    },
  { label: 'Cycling',    value: 'cycling'    },
  { label: 'Swimming',   value: 'swimming'   },
  { label: 'Gym',        value: 'gym'        },
  { label: 'Football',   value: 'football'   },
  { label: 'Basketball', value: 'basketball' },
  { label: 'Badminton',  value: 'badminton'  },
  { label: 'Tennis',     value: 'tennis'     },
  { label: 'Other',      value: 'other'      },
];

export default function PlanWorkoutScreen() {
  const [mode, setMode]       = useState<Mode>('plan');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);

  // ── Plan ─────────────────────────────────────────────────
  const [workoutType, setWorkoutType]             = useState('running');
  const [plannedTime, setPlannedTime]             = useState(new Date());
  const [showPlannedPicker, setShowPlannedPicker] = useState(false);
  const [plannedRpe, setPlannedRpe]               = useState(5);

  // ── Log + Update shared ───────────────────────────────────
  const [logType, setLogType]                     = useState('running');
  const [startTime, setStartTime]                 = useState(new Date());
  const [endTime, setEndTime]                     = useState(new Date());
  const [showStartPicker, setShowStartPicker]     = useState(false);
  const [showEndPicker, setShowEndPicker]         = useState(false);
  const [actualRpe, setActualRpe]                 = useState(5);
  const [heartRate, setHeartRate]                 = useState('');
  const [calories, setCalories]                   = useState('');

  // ── Update ────────────────────────────────────────────────
  const [plannedWorkouts, setPlannedWorkouts]     = useState<any[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [loadingPlanned, setLoadingPlanned]       = useState(false);

  // ── Pickers ───────────────────────────────────────────────
  const onPlannedTimeChange = (_e: DateTimePickerEvent, date?: Date) => {
    setShowPlannedPicker(false);
    if (date) setPlannedTime(date);
  };
  const onStartChange = (_e: DateTimePickerEvent, date?: Date) => {
    setShowStartPicker(false);
    if (date) setStartTime(date);
  };
  const onEndChange = (_e: DateTimePickerEvent, date?: Date) => {
    setShowEndPicker(false);
    if (date) setEndTime(date);
  };

  // ── Helpers ───────────────────────────────────────────────
  const validateTimes = (): boolean => {
    if (endTime <= startTime) {
      Alert.alert('Invalid Times', 'End time must be after start time.');
      return false;
    }
    return true;
  };

  const fetchPlannedWorkouts = async () => {
    try {
      setLoadingPlanned(true);
      const res = await api.get('/workouts/planned');
      const workouts = res.data.workouts ?? [];
      setPlannedWorkouts(workouts);
      if (workouts.length > 0) setSelectedWorkoutId(String(workouts[0].id));
    } catch (err: any) {
      console.error('fetchPlannedWorkouts error:', err.response?.data || err.message);
      Alert.alert('Error', 'Could not load planned workouts.');
    } finally {
      setLoadingPlanned(false);
    }
  };

  const switchMode = (next: Mode) => {
    setSuggestion(null);
    setMode(next);
    if (next === 'update') fetchPlannedWorkouts();
  };

  // ── Submit: plan ──────────────────────────────────────────
  const handlePlanSubmit = async () => {
    try {
      setLoading(true);
      setSuggestion(null);

      const workoutResponse = await api.post('/workouts', {
        planned_type: workoutType,
        planned_time: plannedTime.toISOString(),
        planned_rpe:  plannedRpe,
      });

      const workoutId =
        workoutResponse.data?.workout?.id ??
        workoutResponse.data?.id ??
        workoutResponse.data?.workout_id;

      if (!workoutId) throw new Error('Workout created but no ID returned.');

      const suggestionResponse = await api.post('/suggestions/pre', { workout_id: workoutId });
      setSuggestion(suggestionResponse.data);

      Alert.alert(
        'Workout Planned!',
        'Your workout has been saved. Pre-workout nutrition suggestions are ready below.',
        [{ text: 'Got it' }]
      );
    } catch (error: any) {
      console.error('handlePlanSubmit error:', error.response?.data || error.message);
      Alert.alert('Error', error.response?.data?.error || error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit: log unplanned ─────────────────────────────────
  const handleLogSubmit = async () => {
    if (!validateTimes()) return;

    const payload = {
      actual_type:       logType,
      actual_start_time: startTime.toISOString(),
      actual_end_time:   endTime.toISOString(),
      actual_rpe:        actualRpe,
      heart_rate_avg:    heartRate ? Number(heartRate) : null,
      calories_burned:   calories  ? Number(calories)  : null,
      data_source:       'manual',
    };

    try {
      setLoading(true);
      setSuggestion(null);

      const workoutResponse = await api.post('/workouts/log', payload);

      const workoutId =
        workoutResponse.data?.workout?.id ??
        workoutResponse.data?.id ??
        workoutResponse.data?.workout_id;

      if (!workoutId) throw new Error('Workout logged but no ID returned.');

      const suggestionResponse = await api.post('/suggestions/post', { workout_id: workoutId });
      setSuggestion(suggestionResponse.data);

      const duration = workoutResponse.data?.duration_mins;
      Alert.alert('Workout Logged!', `Total training time: ${duration} minutes.`, [{ text: 'Got it' }]);
    } catch (error: any) {
      console.error('handleLogSubmit error:', error.response?.data || error.message);
      Alert.alert('Error', error.response?.data?.error || error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit: update planned ────────────────────────────────
  const handleUpdateSubmit = async () => {
    if (!selectedWorkoutId) {
      Alert.alert('No workout selected', 'Please select a planned workout.');
      return;
    }
    if (!validateTimes()) return;

    const payload = {
      actual_type:       logType,
      actual_start_time: startTime.toISOString(),
      actual_end_time:   endTime.toISOString(),
      actual_rpe:        actualRpe,
      heart_rate_avg:    heartRate ? Number(heartRate) : null,
      calories_burned:   calories  ? Number(calories)  : null,
      data_source:       'manual',
    };

    try {
      setLoading(true);
      setSuggestion(null);

      const workoutResponse = await api.patch(`/workouts/${selectedWorkoutId}`, payload);

      const workoutId = workoutResponse.data?.workout?.id ?? selectedWorkoutId;

      const suggestionResponse = await api.post('/suggestions/post', { workout_id: workoutId });
      setSuggestion(suggestionResponse.data);

      const duration = workoutResponse.data?.duration_mins;
      Alert.alert('Workout Updated!', `Total training time: ${duration} minutes.`, [{ text: 'Got it' }]);
    } catch (error: any) {
      console.error('handleUpdateSubmit error:', error.response?.data || error.message);
      Alert.alert('Error', error.response?.data?.error || error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Didn't do workout ─────────────────────────────────────
  const handleDidntDoWorkout = () => {
    if (!selectedWorkoutId) {
      Alert.alert('No workout selected', 'Please select a planned workout.');
      return;
    }
    Alert.alert(
      'Skip Workout',
      'Mark this workout as skipped? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, skip it',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await api.patch(`/workouts/${selectedWorkoutId}`, { status: 'skipped' });
              setSuggestion(null);
              Alert.alert('Workout Skipped', 'Your workout has been marked as skipped.', [{ text: 'OK' }]);
            } catch (error: any) {
              console.error('handleDidntDoWorkout error:', error.response?.data || error.message);
              Alert.alert('Error', error.response?.data?.error || error.message || 'Something went wrong');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const suggestionData = suggestion?.suggestion ?? suggestion;

  // ── Shared actual fields ──────────────────────────────────
  const renderActualFields = () => (
    <>
      <Text style={styles.label}>Workout Type</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={logType} onValueChange={setLogType} style={{ color: '#01696f' }}>
          {WORKOUT_TYPES.map((t) => (
            <Picker.Item key={t.value} label={t.label} value={t.value} color="#01696f" />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Start Time</Text>
      <TouchableOpacity style={styles.inputLike} onPress={() => setShowStartPicker(true)}>
        <Text style={styles.inputLikeText}>{startTime.toLocaleString()}</Text>
      </TouchableOpacity>
      {showStartPicker && (
        <DateTimePicker value={startTime} mode="datetime" display="default" onChange={onStartChange} />
      )}

      <Text style={styles.label}>End Time</Text>
      <TouchableOpacity style={styles.inputLike} onPress={() => setShowEndPicker(true)}>
        <Text style={styles.inputLikeText}>{endTime.toLocaleString()}</Text>
      </TouchableOpacity>
      {showEndPicker && (
        <DateTimePicker value={endTime} mode="datetime" display="default" onChange={onEndChange} />
      )}

      <Text style={styles.label}>Actual RPE: {actualRpe}</Text>
      <Slider
        style={{ width: '100%', height: 40 }}
        minimumValue={1} maximumValue={10} step={1}
        value={actualRpe} onValueChange={setActualRpe}
        minimumTrackTintColor="#01696f" maximumTrackTintColor="#d3d3d3" thumbTintColor="#01696f"
      />
      <View style={styles.rpeRow}>
        <Text>1 — Easy</Text>
        <Text>10 — Max</Text>
      </View>

      <Text style={styles.label}>
        Avg Heart Rate <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        style={styles.inputLike}
        keyboardType="numeric"
        placeholder="e.g. 145"
        placeholderTextColor="#aaa"
        value={heartRate}
        onChangeText={setHeartRate}
      />

      <Text style={styles.label}>
        Calories Burned <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        style={styles.inputLike}
        keyboardType="numeric"
        placeholder="e.g. 450"
        placeholderTextColor="#aaa"
        value={calories}
        onChangeText={setCalories}
      />
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── PLAN ─────────────────────────────────────── */}
        {mode === 'plan' && (
          <>
            <Text style={styles.title}>Plan Workout</Text>
            <Text style={styles.subtitle}>
              Schedule your upcoming workout and get a pre-workout nutrition suggestion.
            </Text>

            <Text style={styles.label}>Workout Type</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={workoutType} onValueChange={setWorkoutType} style={{ color: '#01696f' }}>
                {WORKOUT_TYPES.map((t) => (
                  <Picker.Item key={t.value} label={t.label} value={t.value} color="#01696f" />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Planned Date & Time</Text>
            <TouchableOpacity style={styles.inputLike} onPress={() => setShowPlannedPicker(true)}>
              <Text style={styles.inputLikeText}>{plannedTime.toLocaleString()}</Text>
            </TouchableOpacity>
            {showPlannedPicker && (
              <DateTimePicker
                value={plannedTime} mode="datetime" display="default" onChange={onPlannedTimeChange}
              />
            )}

            <Text style={styles.label}>Planned RPE: {plannedRpe}</Text>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={1} maximumValue={10} step={1}
              value={plannedRpe} onValueChange={setPlannedRpe}
              minimumTrackTintColor="#01696f" maximumTrackTintColor="#d3d3d3" thumbTintColor="#01696f"
            />
            <View style={styles.rpeRow}>
              <Text>1 — Easy</Text>
              <Text>10 — Max</Text>
            </View>

            <TouchableOpacity style={styles.button} onPress={handlePlanSubmit} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Plan Workout</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => switchMode('update')}>
              <Text style={styles.secondaryButtonText}>Already planned? Update your workout</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => switchMode('log')}>
              <Text style={styles.secondaryButtonText}>Forgot to plan? Log a completed workout</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── LOG ──────────────────────────────────────── */}
        {mode === 'log' && (
          <>
            <TouchableOpacity onPress={() => switchMode('plan')}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Log Workout</Text>
            <Text style={styles.subtitle}>
              Log a completed workout and get a post-workout nutrition suggestion.
            </Text>

            {renderActualFields()}

            <TouchableOpacity style={styles.button} onPress={handleLogSubmit} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Log Workout</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── UPDATE ───────────────────────────────────── */}
        {mode === 'update' && (
          <>
            <TouchableOpacity onPress={() => switchMode('plan')}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Update Workout</Text>
            <Text style={styles.subtitle}>
              Select your planned workout and fill in what actually happened.
            </Text>

            <Text style={styles.label}>Select Planned Workout</Text>

            {loadingPlanned ? (
              <ActivityIndicator color="#01696f" style={{ marginVertical: 12 }} />
            ) : plannedWorkouts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No planned workouts found.</Text>
                <Text style={styles.emptySubtext}>Head back and plan a workout first.</Text>
              </View>
            ) : (
              plannedWorkouts.map((w) => {
                const isSelected = selectedWorkoutId === String(w.id);
                const typeLabel  = w.planned_type.charAt(0).toUpperCase() + w.planned_type.slice(1);
                const dateLabel  = new Date(w.planned_time).toLocaleDateString('en-SG', {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                });
                const timeLabel  = new Date(w.planned_time).toLocaleTimeString('en-SG', {
                  hour: '2-digit', minute: '2-digit',
                });
                return (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => setSelectedWorkoutId(String(w.id))}
                    style={[styles.workoutCard, isSelected && styles.workoutCardSelected]}
                    activeOpacity={0.75}
                  >
                    <View style={styles.workoutCardRow}>
                      <Text style={[styles.workoutCardType, isSelected && styles.workoutCardTypeSelected]}>
                        {typeLabel}
                      </Text>
                      {isSelected && (
                        <View style={styles.selectedBadge}>
                          <Text style={styles.selectedBadgeText}>Selected</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.workoutCardDate, isSelected && styles.workoutCardDateSelected]}>
                      {dateLabel} · {timeLabel}
                    </Text>
                    <Text style={[styles.workoutCardRpe, isSelected && styles.workoutCardRpeSelected]}>
                      Planned RPE {w.planned_rpe}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}

            {renderActualFields()}

            <TouchableOpacity style={styles.button} onPress={handleUpdateSubmit} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Update Workout</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipButton} onPress={handleDidntDoWorkout} disabled={loading}>
              <Text style={styles.skipButtonText}>Didn't Do Workout</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── SUGGESTION CARD ──────────────────────────── */}
        {suggestionData && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === 'plan' ? '🥗 Pre-Workout Suggestion' : '💪 Post-Workout Suggestion'}
            </Text>
            <Text style={styles.cardText}>Carbs: {suggestionData.carbs_g ?? '—'} g</Text>
            <Text style={styles.cardText}>Protein: {suggestionData.protein_g ?? '—'} g</Text>
            <Text style={styles.cardText}>Hydration: {suggestionData.hydration_ml ?? '—'} ml</Text>
            {suggestionData.notes && (
              <Text style={styles.cardText}>Notes: {suggestionData.notes}</Text>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:                { flex: 1, backgroundColor: '#fff' },
  scroll:                   { padding: 24, paddingBottom: 48 },
  title:                    { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle:                 { fontSize: 14, color: '#666', marginBottom: 8, lineHeight: 20 },
  label:                    { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  optional:                 { fontSize: 13, fontWeight: '400', color: '#999' },
  pickerBox:                { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, overflow: 'hidden', backgroundColor: '#f4f8f8' },
  inputLike:                { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, backgroundColor: '#fff' },
  inputLikeText:            { fontSize: 16, color: '#111' },
  rpeRow:                   { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  workoutCard:              { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: '#fff' },
  workoutCardSelected:      { borderColor: '#01696f', backgroundColor: '#e8f4f4', borderWidth: 2 },
  workoutCardRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  workoutCardType:          { fontSize: 17, fontWeight: '700', color: '#111' },
  workoutCardTypeSelected:  { color: '#01696f' },
  workoutCardDate:          { fontSize: 14, color: '#555', marginBottom: 4 },
  workoutCardDateSelected:  { color: '#01696f' },
  workoutCardRpe:           { fontSize: 13, color: '#999' },
  workoutCardRpeSelected:   { color: '#01696f' },
  selectedBadge:            { backgroundColor: '#01696f', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  selectedBadgeText:        { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyCard:                { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 20, alignItems: 'center', backgroundColor: '#fafafa', marginBottom: 8 },
  emptyText:                { color: '#444', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  emptySubtext:             { color: '#999', fontSize: 13 },
  button:                   { marginTop: 24, backgroundColor: '#01696f', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonText:               { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton:          { marginTop: 12, borderWidth: 1, borderColor: '#01696f', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  secondaryButtonText:      { color: '#01696f', fontSize: 15, fontWeight: '600' },
  skipButton:               { marginTop: 12, borderWidth: 1, borderColor: '#cc3333', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  skipButtonText:           { color: '#cc3333', fontSize: 15, fontWeight: '600' },
  backLink:                 { color: '#01696f', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  card:                     { marginTop: 24, padding: 16, borderRadius: 12, backgroundColor: '#f4f8f8', borderWidth: 1, borderColor: '#d8e7e7' },
  cardTitle:                { fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#01696f' },
  cardText:                 { fontSize: 15, marginBottom: 6, color: '#222' },
});
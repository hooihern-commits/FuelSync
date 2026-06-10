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
import { useRouter } from 'expo-router';

type Mode = 'plan' | 'log' | 'update';

export default function PlanWorkoutScreen() {
  const [mode, setMode] = useState<Mode>('plan');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [suggestionId, setSuggestionId] = useState<number | null>(null);

  // ── Plan mode ────────────────────────────────────────────
  const [workoutType, setWorkoutType] = useState('running');
  const [plannedTime, setPlannedTime] = useState(new Date());
  const [showPlannedTimePicker, setShowPlannedTimePicker] = useState(false);
  const [plannedRpe, setPlannedRpe] = useState(5);

  // ── Shared (log + update) ─────────────────────────────────
  const [logType, setLogType] = useState('running');
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [actualRpe, setActualRpe] = useState(5);
  const [heartRate, setHeartRate] = useState('');
  const [calories, setCalories] = useState('');

  // ── Update mode ───────────────────────────────────────────
  const [plannedWorkouts, setPlannedWorkouts] = useState<any[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [loadingPlanned, setLoadingPlanned] = useState(false);
  const router = useRouter();

  // ── Date/time helpers ─────────────────────────────────────
  const onPlannedTimeChange = (_e: DateTimePickerEvent, date?: Date) => {
    setShowPlannedTimePicker(false);
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

  const fetchPlannedWorkouts = async () => {
    try {
      setLoadingPlanned(true);
      const res = await api.get('/workouts/planned');
      const workouts = res.data.workouts ?? [];
      setPlannedWorkouts(workouts);
      if (workouts.length > 0) setSelectedWorkoutId(workouts[0].id);
    } catch {
      Alert.alert('Error', 'Could not load planned workouts.');
    } finally {
      setLoadingPlanned(false);
    }
  };

  const switchMode = (next: Mode) => {
    setSuggestion(null);
    setSuggestionId(null);
    setMode(next);
    if (next === 'update') fetchPlannedWorkouts();
  };

  // ── Workout type picker items (reused in all modes) ───────
  const workoutTypes = [
    { label: 'Running', value: 'running' },
    { label: 'Cycling', value: 'cycling' },
    { label: 'HIIT', value: 'hiit' },
    { label: 'Swimming', value: 'swimming' },
    { label: 'Gym', value: 'gym' },
    { label: 'Football', value: 'football' },
    { label: 'Basketball', value: 'basketball' },
    { label: 'Badminton', value: 'badminton' },
    { label: 'Tennis', value: 'tennis' },
    { label: 'Other', value: 'other' },
  ];

  // ── Validate start < end ──────────────────────────────────
  const validateTimes = (): boolean => {
    if (endTime <= startTime) {
      Alert.alert('Invalid Times', 'End time must be after start time.');
      return false;
    }
    return true;
  };

  // ── Handlers ──────────────────────────────────────────────

  const handlePlanSubmit = async () => {
    try {
      setLoading(true);
      setSuggestion(null);

      const workoutResponse = await api.post('/workouts', {
        planned_type: workoutType,
        planned_time: plannedTime.toISOString(),
        planned_rpe: plannedRpe,
      });

      const workoutId =
        workoutResponse.data?.workout?.id ??
        workoutResponse.data?.id ??
        workoutResponse.data?.workout_id;

      if (!workoutId) throw new Error('Workout created but no ID returned.');

      const suggestionResponse = await api.post('/suggestions/pre', { workout_id: workoutId });
      setSuggestion(suggestionResponse.data);
      setSuggestionId(suggestionResponse.data?.suggestion?.id ?? null);

      Alert.alert(
        'Workout Planned!',
        'Your workout has been saved. Pre-workout nutrition suggestions are ready below.',
        [{ text: 'Got it' }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleLogSubmit = async () => {
    if (!validateTimes()) return;
    try {
      setLoading(true);
      setSuggestion(null);

      const workoutResponse = await api.post('/workouts/log', {
        actual_type: logType,
        actual_start_time: startTime.toISOString(),
        actual_end_time: endTime.toISOString(),
        actual_rpe: actualRpe,
        heart_rate_avg: heartRate ? Number(heartRate) : null,
        calories_burned: calories ? Number(calories) : null,
        data_source: 'manual',
      });

      const workoutId =
        workoutResponse.data?.workout?.id ??
        workoutResponse.data?.id ??
        workoutResponse.data?.workout_id;

      if (!workoutId) throw new Error('Workout logged but no ID returned.');

      const suggestionResponse = await api.post('/suggestions/post', { workout_id: workoutId });
      setSuggestion(suggestionResponse.data);
      setSuggestionId(suggestionResponse.data?.suggestion?.id ?? null);

      const duration = workoutResponse.data?.duration_mins;
      Alert.alert('Workout Logged!', `Total training time: ${duration} minutes.`, [{ text: 'Got it' }]);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSubmit = async () => {
    if (!selectedWorkoutId) {
      Alert.alert('No workout selected', 'Please select a planned workout.');
      return;
    }
    if (!validateTimes()) return;
    try {
      setLoading(true);
      setSuggestion(null);

      const workoutResponse = await api.patch(`/workouts/${selectedWorkoutId}`, {
        actual_type: logType,
        actual_start_time: startTime.toISOString(),
        actual_end_time: endTime.toISOString(),
        actual_rpe: actualRpe,
        heart_rate_avg: heartRate ? Number(heartRate) : null,
        calories_burned: calories ? Number(calories) : null,
        data_source: 'manual',
        status: 'completed',
      });

      const workoutId = workoutResponse.data?.workout?.id ?? selectedWorkoutId;

      const suggestionResponse = await api.post('/suggestions/post', { workout_id: workoutId });
      setSuggestion(suggestionResponse.data);
      setSuggestionId(suggestionResponse.data?.suggestion?.id ?? null);

      const duration = workoutResponse.data?.duration_mins;
      Alert.alert('Workout Updated!', `Total training time: ${duration} minutes.`, [{ text: 'Got it' }]);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleDidntDoWorkout = async () => {
    if (!selectedWorkoutId) {
      Alert.alert('No workout selected', 'Please select a planned workout.');
      return;
    }
    Alert.alert(
      'Skip Workout',
      'Are you sure you want to mark this workout as skipped?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, skip it',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await api.patch(`/workouts/${selectedWorkoutId}`, {
                status: 'skipped',
                actual_type: null,
                actual_start_time: null,
                actual_end_time: null,
                duration_mins: null,
                actual_rpe: null,
                heart_rate_avg: null,
                calories_burned: null,
              });
              Alert.alert('Workout Skipped', 'Your workout has been marked as skipped.', [{ text: 'OK' }]);
              setSuggestion(null);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || error.message || 'Something went wrong');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const suggestionData = suggestion?.suggestion ?? suggestion;

  // ── Shared form fields for log + update ──────────────────
  const renderActualFields = () => (
    <>
      <Text style={styles.label}>Workout Type</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={logType} onValueChange={setLogType} style={{ color: '#01696f' }}>
          {workoutTypes.map((t) => (
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

      <Text style={styles.label}>Avg Heart Rate <Text style={styles.optional}>(optional)</Text></Text>
      <TextInput
        style={styles.inputLike}
        keyboardType="numeric"
        placeholder="e.g. 145"
        placeholderTextColor="#aaa"
        value={heartRate}
        onChangeText={setHeartRate}
      />

      <Text style={styles.label}>Calories Burned <Text style={styles.optional}>(optional)</Text></Text>
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

        {/* ── PLAN MODE ─────────────────────────────────── */}
        {mode === 'plan' && (
          <>
            <Text style={styles.title}>Plan Workout</Text>
            <Text style={styles.subtitle}>
              Schedule your upcoming workout and get a pre-workout nutrition suggestion.
            </Text>

            <Text style={styles.label}>Workout Type</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={workoutType} onValueChange={setWorkoutType} style={{ color: '#01696f' }}>
                {workoutTypes.map((t) => (
                  <Picker.Item key={t.value} label={t.label} value={t.value} color="#01696f" />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Planned Date & Time</Text>
            <TouchableOpacity style={styles.inputLike} onPress={() => setShowPlannedTimePicker(true)}>
              <Text style={styles.inputLikeText}>{plannedTime.toLocaleString()}</Text>
            </TouchableOpacity>
            {showPlannedTimePicker && (
              <DateTimePicker value={plannedTime} mode="datetime" display="default" onChange={onPlannedTimeChange} />
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
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Plan Workout</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => switchMode('log')}>
              <Text style={styles.secondaryButtonText}>Forgot to plan? Log a completed workout</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => switchMode('update')}>
              <Text style={styles.secondaryButtonText}>Already planned? Update your workout</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── LOG MODE ──────────────────────────────────── */}
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
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log Workout</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── UPDATE MODE ───────────────────────────────── */}
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
              <Text style={styles.emptyText}>No planned workouts found.</Text>
            ) : (
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={selectedWorkoutId}
                  onValueChange={setSelectedWorkoutId}
                  style={{ color: '#01696f' }}
                >
                  {plannedWorkouts.map((w) => (
                    <Picker.Item
                      key={w.id}
                      label={`${w.planned_type} — ${new Date(w.planned_time).toLocaleDateString()}`}
                      value={w.id}
                      color="#01696f"
                    />
                  ))}
                </Picker>
              </View>
            )}

            {renderActualFields()}

            <TouchableOpacity style={styles.button} onPress={handleUpdateSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update Workout</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipButton} onPress={handleDidntDoWorkout} disabled={loading}>
              <Text style={styles.skipButtonText}>Didn't Do Workout</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── SUGGESTION CARD ───────────────────────────── */}
        {suggestionData && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === 'plan' ? '🥗 Pre-Workout Suggestion' : '💪 Post-Workout Suggestion'}
            </Text>
            <Text style={styles.cardText}>Carbs: {suggestionData.carbs_g ?? '—'} g</Text>
            <Text style={styles.cardText}>Protein: {suggestionData.protein_g ?? '—'} g</Text>
            {suggestionData.notes && <Text style={styles.cardText}>Notes: {suggestionData.notes}</Text>}
            {/* ← new button */}
    <TouchableOpacity
      style={styles.logMealBtn}
      onPress={() => router.push({
        pathname: '/(app)/log-meal',
        params: {
          suggestion_id: suggestionId ?? '',
          meal_type: mode === 'plan' ? 'pre_workout' : 'post_workout',
        },
      })}
    >
      <Text style={styles.logMealBtnText}>🍽 Log My Meal</Text>
    </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 8, lineHeight: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  optional: { fontSize: 13, fontWeight: '400', color: '#999' },
  pickerBox: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    overflow: 'hidden', backgroundColor: '#f4f8f8',
  },
  inputLike: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, backgroundColor: '#fff',
  },
  inputLikeText: { fontSize: 16, color: '#111' },
  rpeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  button: {
    marginTop: 24, backgroundColor: '#01696f',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    marginTop: 12, borderWidth: 1, borderColor: '#01696f',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  secondaryButtonText: { color: '#01696f', fontSize: 15, fontWeight: '600' },
  skipButton: {
    marginTop: 12, borderWidth: 1, borderColor: '#cc3333',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  skipButtonText: { color: '#cc3333', fontSize: 15, fontWeight: '600' },
  backLink: { color: '#01696f', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  emptyText: { color: '#888', fontSize: 14, marginTop: 8 },
  card: {
    marginTop: 24, padding: 16, borderRadius: 12,
    backgroundColor: '#f4f8f8', borderWidth: 1, borderColor: '#d8e7e7',
  },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#01696f' },
  cardText: { fontSize: 15, marginBottom: 6, color: '#222' },
  logMealBtn: {
  marginTop: 14, backgroundColor: '#01696f',
  borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  logMealBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
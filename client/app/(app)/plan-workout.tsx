import { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';
import NutrientRec from './nutrientrec';
import { validateTimes, buildWorkoutPayload } from '../../src/utils/workoutUtils';
import {
  planWorkout, logWorkout, updateWorkout, skipWorkout,
  fetchPlannedWorkouts, getPreSuggestion, getPostSuggestion,
} from '../../src/services/workoutService';
import { scheduleRecoveryCheckinReminder } from '../../src/services/notifications';
import { useTheme, ThemeColors } from '../../src/theme';

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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  const switchMode = async (next: Mode) => {
    setSuggestion(null);
    setSelectedWorkoutId(null);
    setMode(next);
    if (next === 'update') {
      try {
        setLoadingPlanned(true);
        const workouts = await fetchPlannedWorkouts();
        setPlannedWorkouts(workouts);
        if (workouts.length > 0) setSelectedWorkoutId(String(workouts[0].id));
      } catch (err: any) {
        console.error('fetchPlannedWorkouts error:', err.response?.data || err.message);
        Alert.alert('Error', 'Could not load planned workouts.');
      } finally {
        setLoadingPlanned(false);
      }
    }
  };

  // ── Submit: plan ──────────────────────────────────────────
  const handlePlanSubmit = async () => {
    try {
      setLoading(true);
      setSuggestion(null);

      const data      = await planWorkout(workoutType, plannedTime, plannedRpe);
      const workoutId = data?.workout?.id ?? data?.id;
      if (!workoutId) {
        console.error('Unexpected planWorkout response shape:', JSON.stringify(data));
        throw new Error('Workout created but no ID returned. Check console for response shape.');
      }

      const suggestionData = await getPreSuggestion(workoutId);
      setSuggestion(suggestionData);

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
    if (!validateTimes(startTime, endTime)) {
      Alert.alert('Invalid Times', 'End time must be after start time.');
      return;
    }

    const payload = buildWorkoutPayload(logType, startTime, endTime, actualRpe, heartRate, calories);

    try {
      setLoading(true);
      setSuggestion(null);

      const data      = await logWorkout(payload);
      const workoutId = data?.workout?.id ?? data?.id;
      if (!workoutId) {
        console.error('Unexpected logWorkout response shape:', JSON.stringify(data));
        throw new Error('Workout logged but no ID returned. Check console for response shape.');
      }

      await scheduleRecoveryCheckinReminder(workoutId);

      const suggestionData = await getPostSuggestion(workoutId);
      setSuggestion(suggestionData);
      Alert.alert('Workout Logged!', `Total training time: ${data?.duration_mins} minutes.`, [{ text: 'Got it' }]);
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
    if (!validateTimes(startTime, endTime)) {
      Alert.alert('Invalid Times', 'End time must be after start time.');
      return;
    }

    const payload = buildWorkoutPayload(logType, startTime, endTime, actualRpe, heartRate, calories);

    try {
      setLoading(true);
      setSuggestion(null);

      const data      = await updateWorkout(selectedWorkoutId, payload);
      const workoutId = data?.workout?.id ?? selectedWorkoutId;

      await scheduleRecoveryCheckinReminder(workoutId);

      setPlannedWorkouts(prev => prev.filter(w => String(w.id) !== selectedWorkoutId));
      setSelectedWorkoutId(null);

      const suggestionData = await getPostSuggestion(workoutId);
      setSuggestion(suggestionData);

      Alert.alert('Workout Updated!', `Total training time: ${data?.duration_mins} minutes.`, [{ text: 'Got it' }]);
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
              await skipWorkout(selectedWorkoutId);
              setPlannedWorkouts(prev => prev.filter(w => String(w.id) !== selectedWorkoutId));
              setSelectedWorkoutId(null);
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
        <Picker selectedValue={logType} onValueChange={setLogType} style={{ color: colors.teal }}>
          {WORKOUT_TYPES.map((t) => (
            <Picker.Item key={t.value} label={t.label} value={t.value} color={colors.teal} />
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
        minimumTrackTintColor={colors.teal} maximumTrackTintColor={colors.track} thumbTintColor={colors.teal}
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
        placeholderTextColor={colors.muted}
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
        placeholderTextColor={colors.muted}
        value={calories}
        onChangeText={setCalories}
      />
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

        {/* ── PLAN ─────────────────────────────────────── */}
        {mode === 'plan' && (
          <>
            <Text style={styles.title}>Plan Workout</Text>
            <Text style={styles.subtitle}>
              Schedule your upcoming workout and get a pre-workout nutrition suggestion.
            </Text>

            <Text style={styles.label}>Workout Type</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={workoutType} onValueChange={setWorkoutType} style={{ color: colors.teal }}>
                {WORKOUT_TYPES.map((t) => (
                  <Picker.Item key={t.value} label={t.label} value={t.value} color={colors.teal} />
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
              minimumTrackTintColor={colors.teal} maximumTrackTintColor={colors.track} thumbTintColor={colors.teal}
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
              <ActivityIndicator color={colors.teal} style={{ marginVertical: 12 }} />
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
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>
                {mode === 'plan' ? 'Pre-Workout Suggestion' : 'Post-Workout Suggestion'}
              </Text>
              <Text style={styles.cardTimestamp}>Just now</Text>
            </View>

            <View style={styles.ringsRow}>
              <NutrientRec
                value={suggestionData.suggested_calories ?? null}
                unit="kcal"
                label="Calories"
                color="#cc3333"
              />
              <NutrientRec
                value={suggestionData.suggested_protein ?? null}
                unit="g"
                label="Protein"
                color={colors.teal}
              />
              <NutrientRec
                value={suggestionData.suggested_carbs ?? null}
                unit="g"
                label="Carbs"
                color="#d99a1b"
              />
            </View>

            {suggestionData.text && (
              <View style={styles.tipBox}>
                <Text style={styles.tipIcon}>💡</Text>
                <Text style={styles.tipText}>{suggestionData.text}</Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container:                { flex: 1, backgroundColor: c.bg },
    scroll:                   { padding: 24, paddingBottom: 48 },
    title:                    { fontSize: 28, fontWeight: 'bold', marginBottom: 8, color: c.text },
    subtitle:                 { fontSize: 14, color: c.subtext, marginBottom: 8, lineHeight: 20 },
    label:                    { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16, color: c.text },
    optional:                 { fontSize: 13, fontWeight: '400', color: c.muted },
    rpeText:                  { fontSize: 13, color: c.subtext },
    pickerBox:                { borderWidth: 1, borderColor: c.inputBorder, borderRadius: 10, overflow: 'hidden', backgroundColor: c.card },
    inputLike:                { borderWidth: 1, borderColor: c.inputBorder, borderRadius: 10, padding: 14, backgroundColor: c.inputBg, color: c.text },
    inputLikeText:            { fontSize: 16, color: c.text },
    rpeRow:                   { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
    workoutCard:              { borderWidth: 1, borderColor: c.cardBorder, borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: c.card },
    workoutCardSelected:      { borderColor: c.teal, backgroundColor: c.card, borderWidth: 2 },
    workoutCardRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    workoutCardType:          { fontSize: 17, fontWeight: '700', color: c.text },
    workoutCardTypeSelected:  { color: c.teal },
    workoutCardDate:          { fontSize: 14, color: c.subtext, marginBottom: 4 },
    workoutCardDateSelected:  { color: c.teal },
    workoutCardRpe:           { fontSize: 13, color: c.muted },
    workoutCardRpeSelected:   { color: c.teal },
    selectedBadge:            { backgroundColor: c.teal, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    selectedBadgeText:        { color: '#fff', fontSize: 12, fontWeight: '600' },
    emptyCard:                { borderWidth: 1, borderColor: c.cardBorder, borderRadius: 12, padding: 20, alignItems: 'center', backgroundColor: c.card, marginBottom: 8 },
    emptyText:                { color: c.text, fontSize: 15, fontWeight: '600', marginBottom: 4 },
    emptySubtext:             { color: c.muted, fontSize: 13 },
    button:                   { marginTop: 24, backgroundColor: c.teal, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    buttonText:               { color: '#fff', fontSize: 16, fontWeight: '600' },
    secondaryButton:          { marginTop: 12, borderWidth: 1, borderColor: c.teal, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    secondaryButtonText:      { color: c.teal, fontSize: 15, fontWeight: '600' },
    skipButton:               { marginTop: 12, borderWidth: 1, borderColor: '#cc3333', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    skipButtonText:           { color: '#cc3333', fontSize: 15, fontWeight: '600' },
    backLink:                 { color: c.teal, fontSize: 14, fontWeight: '600', marginBottom: 12 },
    card:                     { marginTop: 24, padding: 18, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    cardHeaderRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    cardTitle:                { fontSize: 17, fontWeight: '700', color: c.text },
    cardTimestamp:            { fontSize: 12, color: c.muted },
    ringsRow:                 { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
    tipBox:                   { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.track, borderRadius: 12, padding: 12, gap: 8 },
    tipIcon:                  { fontSize: 16 },
    tipText:                  { flex: 1, fontSize: 13, color: c.text, lineHeight: 18 },
  });
}
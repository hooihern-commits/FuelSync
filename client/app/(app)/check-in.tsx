import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import api from '../../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearPendingCheckinFlag } from '../../src/services/notifications';

interface CompletedWorkout {
  id: number;
  actual_type: string | null;
  actual_start_time: string | null;
  planned_type: string;
  planned_time: string;
  status: string;
}

const SLIDER_LABELS: Record<string, string[]> = {
  sleep_quality:   ['Terrible', 'Poor', 'Fair', 'Good', 'Excellent'],
  muscle_soreness: ['Very Sore', 'Sore', 'Moderate', 'Good', 'Fully Recovered'],
  energy_level:    ['Exhausted','Low',  'Moderate', 'Good', 'High'],
  overall_feeling: ['Terrible', 'Poor', 'Fair', 'Good', 'Great'],
};

const SLIDER_EMOJIS: Record<string, string[]> = {
  sleep_quality:   ['😫', '😴', '😐', '🙂', '😄'],
  muscle_soreness: ['🔴', '🟠', '🟡', '🟢', '💪'],
  energy_level:    ['🪫', '😔', '😐', '😊', '🔥'],
  overall_feeling: ['😩', '😕', '😐', '🙂', '😁'],
};

function getScoreColor(score: number): string {
  if (score >= 80) return '#2e7d32';
  if (score >= 65) return '#f57c00';
  if (score >= 50) return '#ef6c00';
  return '#c62828';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent Recovery';
  if (score >= 65) return 'Good Recovery';
  if (score >= 50) return 'Moderate Recovery';
  if (score >= 35) return 'Poor Recovery';
  return 'Very Poor Recovery';
}

export default function CheckinScreen() {
  const router = useRouter();

  const [workouts, setWorkouts] = useState<CompletedWorkout[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<CompletedWorkout | null>(null);
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);

  const [sleepQuality,   setSleepQuality]   = useState(3);
  const [muscleSoreness, setMuscleSoreness] = useState(3);
  const [energyLevel,    setEnergyLevel]    = useState(3);
  const [overallFeeling, setOverallFeeling] = useState(3);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchCompletedWorkouts(); }, []);

  async function fetchCompletedWorkouts() {
    try {
      setLoadingWorkouts(true);
      const res = await api.get('/workouts');
      const completed = (res.data.workouts as any[]).filter((w: any) => w.status === 'completed');
      setWorkouts(completed);
      if (completed.length > 0) setSelectedWorkout(completed[0]);
    } catch {
      Alert.alert('Error', 'Could not load your recent workouts.');
    } finally {
      setLoadingWorkouts(false);
    }
  }

  async function handleSubmit() {
    if (!selectedWorkout) {
      Alert.alert('No Workout Selected', 'Please select a workout to link this check-in to.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await api.post('/recovery', {
        workout_id:         selectedWorkout.id,
        sleep_quality:      sleepQuality,
        muscle_soreness:    muscleSoreness,
        energy_level:       energyLevel,
        overall_feeling:    overallFeeling,
        resting_hr:         null,
        hrv_score:          null,
        sleep_duration_hrs: null,
      });

      const { recovery_score } = res.data;

      await clearPendingCheckinFlag(); 
      
      Alert.alert(
        'Check-In Saved! 🎉',
        `Your recovery score is ${recovery_score}/100 — ${getScoreLabel(recovery_score)}.`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to save check-in. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  }

  function SliderRow({
    label,
    field,
    value,
    onChange,
  }: {
    label: string;
    field: string;
    value: number;
    onChange: (v: number) => void;
  }) {
    const index = value - 1;
    const emoji = SLIDER_EMOJIS[field][index];
    const text  = SLIDER_LABELS[field][index];

    return (
      <View style={styles.sliderCard}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>{label}</Text>
          <View style={styles.sliderBadge}>
            <Text style={styles.sliderEmoji}>{emoji}</Text>
            <Text style={styles.sliderBadgeText}>{text}</Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={5}
          step={1}
          value={value}
          onValueChange={(v) => onChange(Math.round(v))}
          minimumTrackTintColor="#01696f"
          maximumTrackTintColor="#d8e7e7"
          thumbTintColor="#01696f"
        />
        <View style={styles.sliderTicks}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Text key={n} style={[styles.sliderTick, value === n && styles.sliderTickActive]}>
              {n}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  if (loadingWorkouts) {
    return (
      <SafeAreaView  style={styles.centered}>
        <ActivityIndicator size="large" color="#01696f" style={{ marginTop: 48 }} />
        <Text style={styles.loadingText}>Loading workouts…</Text>
      </SafeAreaView>
    );
  }

  if (workouts.length === 0) {
    return (
      <SafeAreaView style={styles.container} >
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>🏅</Text>
        <Text style={styles.emptyTitle}>No Workouts to Check In</Text>
        <Text style={styles.emptySubtitle}>
          Complete a workout first, then come back here the next morning to log your recovery.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" >
      <View style={styles.header}>
        <Text style={styles.title}>Recovery Check-In</Text>
        <Text style={styles.subtitle}>How did your body respond to yesterday's session?</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Linked Workout</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {workouts.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={[styles.workoutChip, selectedWorkout?.id === w.id && styles.workoutChipActive]}
              onPress={() => setSelectedWorkout(w)}
            >
              <Text style={[styles.workoutChipText, selectedWorkout?.id === w.id && styles.workoutChipTextActive]}>
                {w.actual_type}
              </Text>
              <Text style={[styles.workoutChipDate, selectedWorkout?.id === w.id && styles.workoutChipDateActive]}>
                {(() => {
                  const raw = w.actual_start_time ?? w.planned_time;
                  if (!raw) return 'No date';
                  const d = new Date(raw);
                  return isNaN(d.getTime()) ? 'No date' : d.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
                })()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
  <Text style={styles.sectionLabel}>How Are You Feeling?</Text>

  <View style={styles.sliderCard}>
    <View style={styles.sliderHeader}>
      <Text style={styles.sliderLabel}>😴  Sleep Quality</Text>
      <View style={styles.sliderBadge}>
        <Text style={styles.sliderEmoji}>{SLIDER_EMOJIS.sleep_quality[sleepQuality - 1]}</Text>
        <Text style={styles.sliderBadgeText}>{SLIDER_LABELS.sleep_quality[sleepQuality - 1]}</Text>
      </View>
    </View>
    <Slider style={styles.slider} minimumValue={1} maximumValue={5} step={1} value={sleepQuality} onValueChange={(v) => setSleepQuality(Math.round(v))} minimumTrackTintColor="#01696f" maximumTrackTintColor="#d8e7e7" thumbTintColor="#01696f" />
    <View style={styles.sliderTicks}>{[1,2,3,4,5].map(n => <Text key={n} style={[styles.sliderTick, sleepQuality === n && styles.sliderTickActive]}>{n}</Text>)}</View>
  </View>

  <View style={styles.sliderCard}>
    <View style={styles.sliderHeader}>
      <Text style={styles.sliderLabel}>💪  Muscle Recovery</Text>
      <View style={styles.sliderBadge}>
        <Text style={styles.sliderEmoji}>{SLIDER_EMOJIS.muscle_soreness[muscleSoreness - 1]}</Text>
        <Text style={styles.sliderBadgeText}>{SLIDER_LABELS.muscle_soreness[muscleSoreness - 1]}</Text>
      </View>
    </View>
    <Slider style={styles.slider} minimumValue={1} maximumValue={5} step={1} value={muscleSoreness} onValueChange={(v) => setMuscleSoreness(Math.round(v))} minimumTrackTintColor="#01696f" maximumTrackTintColor="#d8e7e7" thumbTintColor="#01696f" />
    <View style={styles.sliderTicks}>{[1,2,3,4,5].map(n => <Text key={n} style={[styles.sliderTick, muscleSoreness === n && styles.sliderTickActive]}>{n}</Text>)}</View>
  </View>

  <View style={styles.sliderCard}>
    <View style={styles.sliderHeader}>
      <Text style={styles.sliderLabel}>⚡  Energy Level</Text>
      <View style={styles.sliderBadge}>
        <Text style={styles.sliderEmoji}>{SLIDER_EMOJIS.energy_level[energyLevel - 1]}</Text>
        <Text style={styles.sliderBadgeText}>{SLIDER_LABELS.energy_level[energyLevel - 1]}</Text>
      </View>
    </View>
    <Slider style={styles.slider} minimumValue={1} maximumValue={5} step={1} value={energyLevel} onValueChange={(v) => setEnergyLevel(Math.round(v))} minimumTrackTintColor="#01696f" maximumTrackTintColor="#d8e7e7" thumbTintColor="#01696f" />
    <View style={styles.sliderTicks}>{[1,2,3,4,5].map(n => <Text key={n} style={[styles.sliderTick, energyLevel === n && styles.sliderTickActive]}>{n}</Text>)}</View>
  </View>

  <View style={styles.sliderCard}>
    <View style={styles.sliderHeader}>
      <Text style={styles.sliderLabel}>🧠  Overall Feeling</Text>
      <View style={styles.sliderBadge}>
        <Text style={styles.sliderEmoji}>{SLIDER_EMOJIS.overall_feeling[overallFeeling - 1]}</Text>
        <Text style={styles.sliderBadgeText}>{SLIDER_LABELS.overall_feeling[overallFeeling - 1]}</Text>
      </View>
    </View>
    <Slider style={styles.slider} minimumValue={1} maximumValue={5} step={1} value={overallFeeling} onValueChange={(v) => setOverallFeeling(Math.round(v))} minimumTrackTintColor="#01696f" maximumTrackTintColor="#d8e7e7" thumbTintColor="#01696f" />
    <View style={styles.sliderTicks}>{[1,2,3,4,5].map(n => <Text key={n} style={[styles.sliderTick, overallFeeling === n && styles.sliderTickActive]}>{n}</Text>)}</View>
  </View>

</View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Notes (Optional)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="e.g. Legs felt heavy, slight knee tightness…"
          placeholderTextColor="#999"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Save Recovery Check-In</Text>
        }
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: '#fff' },
  content:               { padding: 20 },
  centered:              { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  loadingText:           { marginTop: 12, color: '#666', fontSize: 15 },
  emptyEmoji:            { fontSize: 48, marginBottom: 16 },
  emptyTitle:            { fontSize: 18, fontWeight: '600', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  emptySubtitle:         { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  header:                { marginBottom: 28 },
  title:                 { fontSize: 26, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  subtitle:              { fontSize: 15, color: '#666', lineHeight: 22 },
  section:               { marginBottom: 24 },
  sectionLabel:          { fontSize: 13, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  workoutChip:           { borderWidth: 1, borderColor: '#d8e7e7', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginRight: 10, backgroundColor: '#f4f8f8', alignItems: 'center', minWidth: 90 },
  workoutChipActive:     { backgroundColor: '#01696f', borderColor: '#01696f' },
  workoutChipText:       { fontSize: 13, fontWeight: '600', color: '#1a1a1a', textTransform: 'capitalize' },
  workoutChipTextActive: { color: '#fff' },
  workoutChipDate:       { fontSize: 11, color: '#666', marginTop: 2 },
  workoutChipDateActive: { color: 'rgba(255,255,255,0.8)' },
  sliderCard:            { backgroundColor: '#f4f8f8', borderRadius: 10, borderWidth: 1, borderColor: '#d8e7e7', padding: 16, marginBottom: 12 },
  sliderHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sliderLabel:           { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  sliderBadge:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: '#d8e7e7', gap: 5 },
  sliderEmoji:           { fontSize: 14 },
  sliderBadgeText:       { fontSize: 12, fontWeight: '500', color: '#01696f' },
  slider:                { width: '100%', height: 40 },
  sliderTicks:           { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Platform.OS === 'ios' ? 10 : 8, marginTop: -4 },
  sliderTick:            { fontSize: 12, color: '#aaa', fontWeight: '500' },
  sliderTickActive:      { color: '#01696f', fontWeight: '700' },
  notesInput:            { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 15, color: '#1a1a1a', backgroundColor: '#fff', minHeight: 90 },
  button:                { backgroundColor: '#01696f', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled:        { opacity: 0.6 },
  buttonText:            { color: '#fff', fontSize: 16, fontWeight: '600' },
  bottomSpacer:          { height: 32 },
});
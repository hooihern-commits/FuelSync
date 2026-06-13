import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import api from '../../src/api/client';

const STATUS_COLORS: Record<string, string> = {
  completed: '#01696f',
  planned:   '#f0a500',
  skipped:   '#cc3333',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  planned:   'Planned',
  skipped:   'Skipped',
};

const Row = ({ label, value }: { label: string; value: string | number | null | undefined }) => {
  if (value == null || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
};

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { workoutDetail } = useLocalSearchParams<{ workoutDetail: string }>();
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res   = await api.get('/workouts');
        const found = (res.data.workouts ?? []).find((w: any) => String(w.id) === workoutDetail);
        setWorkout(found ?? null);
      } catch (err: any) {
        console.error('WorkoutDetail fetch error:', err.response?.data || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [workoutDetail]);

  const fmt = (dateStr: string | null | undefined, mode: 'date' | 'time' | 'datetime') => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (mode === 'date')     return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (mode === 'time')     return d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#01696f" style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  if (!workout) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity onPress={() => router.push('/(app)/history')} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Workout not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const typeLabel   = workout.actual_type ?? workout.planned_type ?? 'Workout';
  const displayType = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  const statusColor = STATUS_COLORS[workout.status] ?? '#888';
  const statusLabel = STATUS_LABELS[workout.status] ?? workout.status;
  const isCompleted = workout.status === 'completed';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        <TouchableOpacity onPress={() => router.push('/(app)/history')} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>{displayType}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {isCompleted && (
          <View style={styles.statsRow}>
            {workout.duration_mins != null && (
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{workout.duration_mins}</Text>
                <Text style={styles.statLabel}>mins</Text>
              </View>
            )}
            {workout.actual_rpe != null && (
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{workout.actual_rpe}</Text>
                <Text style={styles.statLabel}>RPE</Text>
              </View>
            )}
            {workout.heart_rate_avg != null && (
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{workout.heart_rate_avg}</Text>
                <Text style={styles.statLabel}>avg bpm</Text>
              </View>
            )}
            {workout.calories_burned != null && (
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{workout.calories_burned}</Text>
                <Text style={styles.statLabel}>kcal</Text>
              </View>
            )}
          </View>
        )}

        {isCompleted && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actual Workout</Text>
            <Row label="Date"            value={fmt(workout.actual_start_time, 'date')} />
            <Row label="Start Time"      value={fmt(workout.actual_start_time, 'time')} />
            <Row label="End Time"        value={fmt(workout.actual_end_time,   'time')} />
            <Row label="Duration"        value={workout.duration_mins   != null ? `${workout.duration_mins} minutes`   : null} />
            <Row label="RPE"             value={workout.actual_rpe      != null ? `${workout.actual_rpe} / 10`         : null} />
            <Row label="Avg Heart Rate"  value={workout.heart_rate_avg  != null ? `${workout.heart_rate_avg} bpm`      : null} />
            <Row label="Calories Burned" value={workout.calories_burned != null ? `${workout.calories_burned} kcal`    : null} />
            <Row label="Data Source"     value={workout.data_source} />
            <Row label="Notes"           value={workout.notes} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isCompleted ? 'Original Plan' : 'Planned Workout'}
          </Text>
          <Row label="Type"         value={workout.planned_type ? workout.planned_type.charAt(0).toUpperCase() + workout.planned_type.slice(1) : null} />
          <Row label="Planned Time" value={fmt(workout.planned_time, 'datetime')} />
          <Row label="Planned RPE"  value={workout.planned_rpe != null ? `${workout.planned_rpe} / 10` : null} />
        </View>

        {workout.status === 'skipped' && (
          <View style={styles.skippedCard}>
            <Text style={styles.skippedText}>This workout was marked as skipped.</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  scroll:       { padding: 24, paddingBottom: 48 },
  backBtn:      { marginBottom: 16 },
  backText:     { color: '#01696f', fontSize: 14, fontWeight: '600' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:        { fontSize: 28, fontWeight: 'bold', color: '#111' },
  statusBadge:  { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  statusText:   { fontSize: 13, fontWeight: '600' },
  statsRow:     { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#f4f8f8', borderRadius: 14, padding: 16, marginBottom: 24 },
  statBox:      { alignItems: 'center' },
  statValue:    { fontSize: 22, fontWeight: '800', color: '#01696f' },
  statLabel:    { fontSize: 12, color: '#888', marginTop: 2 },
  section:      { marginBottom: 24, borderWidth: 1, borderColor: '#eee', borderRadius: 14, overflow: 'hidden' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#01696f', backgroundColor: '#f4f8f8', paddingHorizontal: 16, paddingVertical: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  rowLabel:     { fontSize: 14, color: '#888', flex: 1 },
  rowValue:     { fontSize: 14, color: '#111', fontWeight: '600', flex: 2, textAlign: 'right' },
  emptyCard:    { margin: 24, padding: 28, borderRadius: 14, backgroundColor: '#fafafa', alignItems: 'center' },
  emptyText:    { fontSize: 15, color: '#888' },
  skippedCard:  { backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#ffcccc', borderRadius: 12, padding: 16, alignItems: 'center' },
  skippedText:  { color: '#cc3333', fontSize: 14, fontWeight: '600' },
});
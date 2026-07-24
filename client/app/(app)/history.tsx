import { useState, useCallback, useMemo } from 'react';
import { View, Text , TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, RefreshControl } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import api from '../../src/api/client';
import { useTheme, ThemeColors } from '../../src/theme';

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

export default function HistoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [workouts, setWorkouts]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWorkouts = async () => {
    try {
      const res = await api.get('/workouts');
      setWorkouts(res.data.workouts ?? []);
    } catch (err: any) {
      console.error('fetchWorkouts error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchWorkouts();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchWorkouts();
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-SG', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('en-SG', {
      hour: '2-digit', minute: '2-digit',
    });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.teal} style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
      >
        <Text style={styles.title}>Activity History</Text>
        <Text style={styles.subtitle}>Tap any workout to see full details.</Text>

        {workouts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No workouts yet.</Text>
            <Text style={styles.emptySubtext}>Plan or log a workout to get started.</Text>
          </View>
        ) : (
          workouts.map((w) => {
            const typeLabel   = w.actual_type ?? w.planned_type ?? 'Workout';
            const displayType = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
            const dateStr     = w.actual_start_time ?? w.planned_time;
            const statusColor = STATUS_COLORS[w.status] ?? '#888';
            const statusLabel = STATUS_LABELS[w.status] ?? w.status;

            return (
              <TouchableOpacity
                key={w.id}
                style={styles.card}
                activeOpacity={0.75}
                onPress={() => router.push(`/(app)/${w.id}` as any)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardType}>{displayType}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>

                <Text style={styles.cardDate}>
                  {dateStr ? formatDate(dateStr) : '—'}
                  {w.actual_start_time ? ` · ${formatTime(w.actual_start_time)}` : ''}
                </Text>

                <View style={styles.cardStats}>
                  {w.duration_mins != null && (
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{w.duration_mins}</Text>
                      <Text style={styles.statLabel}>mins</Text>
                    </View>
                  )}
                  {w.actual_rpe != null && (
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{w.actual_rpe}</Text>
                      <Text style={styles.statLabel}>RPE</Text>
                    </View>
                  )}
                  {w.heart_rate_avg != null && (
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{w.heart_rate_avg}</Text>
                      <Text style={styles.statLabel}>avg bpm</Text>
                    </View>
                  )}
                  {w.calories_burned != null && (
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{w.calories_burned}</Text>
                      <Text style={styles.statLabel}>kcal</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.bg },
    scroll:       { padding: 24, paddingBottom: 48 },
    title:        { fontSize: 28, fontWeight: 'bold', marginBottom: 6, color: c.text },
    subtitle:     { fontSize: 14, color: c.subtext, marginBottom: 20 },
    emptyCard:    { borderWidth: 1, borderColor: c.cardBorder, borderRadius: 12, padding: 28, alignItems: 'center', backgroundColor: c.card },
    emptyText:    { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 6 },
    emptySubtext: { fontSize: 13, color: c.muted },
    card:         { borderWidth: 1, borderColor: c.cardBorder, borderRadius: 14, padding: 16, marginBottom: 12, backgroundColor: c.card, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1, position: 'relative' },
    cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardType:     { fontSize: 18, fontWeight: '700', color: c.text },
    cardDate:     { fontSize: 13, color: c.subtext, marginBottom: 12 },
    statusBadge:  { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    statusText:   { fontSize: 12, fontWeight: '600' },
    cardStats:    { flexDirection: 'row', gap: 20 },
    stat:         { alignItems: 'center' },
    statValue:    { fontSize: 17, fontWeight: '700', color: c.teal },
    statLabel:    { fontSize: 11, color: c.muted, marginTop: 1 },
    chevron:      { position: 'absolute', right: 16, top: '50%', fontSize: 22, color: c.muted },
  });
}
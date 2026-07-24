import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { removeToken } from '../../src/storage/token';
import { getUser, clearUser, StoredUser } from '../../src/storage/user';
import { fetchWorkouts } from '../../src/services/workoutService';
import {
  getLatestSuggestion, getMeals, getLatestRecovery, recordLoginStreak, isSameDay,
  Suggestion, Meal, Recovery,
} from '../../src/services/homeService';
import { useTheme, ThemeColors } from '../../src/theme';
import SettingsDrawer from '../../src/components/SettingsDrawer';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function scoreColor(s: number): string {
  if (s >= 80) return '#2e7d32';
  if (s >= 65) return '#f57c00';
  if (s >= 50) return '#ef6c00';
  return '#c62828';
}

function scoreLabel(s: number): string {
  if (s >= 80) return 'Excellent Recovery';
  if (s >= 65) return 'Good Recovery';
  if (s >= 50) return 'Moderate Recovery';
  if (s >= 35) return 'Poor Recovery';
  return 'Very Poor Recovery';
}

// ── Speedometer gauge (top semicircle: 0 left → 100 right) ──
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

function RecoveryGauge({ score, styles, colors }: { score: number | null; styles: any; colors: ThemeColors }) {
  const cx = 100, cy = 100, r = 82;
  const f = score != null ? Math.max(0, Math.min(score, 100)) / 100 : 0;
  const angle = -90 + 180 * f;
  const tip = polar(cx, cy, r - 16, angle);
  const color = score != null ? scoreColor(score) : colors.muted;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={200} height={118} viewBox="0 0 200 118">
        <Path d={arc(cx, cy, r, -90, 90)} stroke={colors.track} strokeWidth={14} fill="none" strokeLinecap="round" />
        {score != null && (
          <Path d={arc(cx, cy, r, -90, angle)} stroke={color} strokeWidth={14} fill="none" strokeLinecap="round" />
        )}
        {score != null && (
          <>
            <Line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={3} strokeLinecap="round" />
            <Circle cx={cx} cy={cy} r={7} fill={color} />
          </>
        )}
      </Svg>
      {score != null ? (
        <>
          <Text style={[styles.gaugeScore, { color }]}>
            {Math.round(score)}<Text style={styles.gaugeOutOf}> /100</Text>
          </Text>
          <Text style={styles.gaugeLabel}>{scoreLabel(score)}</Text>
        </>
      ) : (
        <Text style={styles.cardEmpty}>No recovery check-in logged yet.</Text>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [lastWorkout, setLastWorkout] = useState<any | null>(null);
  const [streak, setStreak] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [u, w, m, s, rec, days] = await Promise.all([
        getUser(),
        fetchWorkouts().catch(() => []),
        getMeals().catch(() => []),
        getLatestSuggestion().catch(() => null),
        getLatestRecovery().catch(() => null),
        recordLoginStreak().catch(() => 0),
      ]);
      setUser(u);
      setWorkouts(w);
      setMeals(m);
      setSuggestion(s);
      setRecovery(rec);
      setStreak(days);

      const done = w
        .filter((x: any) => x.status === 'completed' && x.actual_start_time)
        .sort((a: any, b: any) =>
          new Date(b.actual_start_time).getTime() - new Date(a.actual_start_time).getTime());
      setLastWorkout(done[0] ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleLogout = async () => {
    await removeToken();
    await clearUser();
    router.replace('/(auth)/login');
  };

  const todayWorkout =
    workouts.find((w) => w.status === 'completed' && isSameDay(w.actual_start_time)) ??
    workouts.find((w) => w.status === 'planned' && isSameDay(w.planned_time)) ??
    null;

  const todayMeals = meals.filter((m) => isSameDay(m.logged_at));
  const totals = todayMeals.reduce(
    (a, m) => ({
      cals: a.cals + Number(m.calories_kcal || 0),
      carbs: a.carbs + Number(m.carbs_g || 0),
      protein: a.protein + Number(m.protein_g || 0),
      fat: a.fat + Number(m.fat_g || 0),
    }),
    { cals: 0, carbs: 0, protein: 0, fat: 0 }
  );

  const recNeedsCheckin = !!lastWorkout && (!recovery || recovery.workout_id !== lastWorkout.id);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.teal} />
      </SafeAreaView>
    );
  }

  const today = new Date().toLocaleDateString('en-SG', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{user?.name ?? 'Athlete'} 👋</Text>
            <Text style={styles.date}>{today}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.streakPill}>
              <Text style={styles.streakPillText}>🔥 {streak}</Text>
            </View>
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={22} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}>
              <Ionicons name="log-out-outline" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pending recovery check-in nudge */}
        {recNeedsCheckin && (
          <TouchableOpacity style={styles.nudge} onPress={() => router.push('/(app)/check-in')}>
            <Ionicons name="heart-outline" size={20} color="#fff" />
            <Text style={styles.nudgeText}>
              How did you recover from your last workout? Tap to check in.
            </Text>
          </TouchableOpacity>
        )}

        {/* Recovery gauge */}
        <Text style={styles.sectionTitle}>Recovery</Text>
        <View style={styles.card}>
          <RecoveryGauge score={recovery ? Number(recovery.recovery_score) : null} styles={styles} colors={colors} />
        </View>

        {/* Today's Workout */}
        <Text style={styles.sectionTitle}>Today's Workout</Text>
        <View style={styles.card}>
          {todayWorkout ? (
            <>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>
                  {(todayWorkout.actual_type || todayWorkout.planned_type || 'Workout')}
                </Text>
                <View style={[styles.badge, todayWorkout.status === 'completed' ? styles.badgeDone : styles.badgePlanned]}>
                  <Text style={[styles.badgeText, todayWorkout.status === 'completed' && { color: '#2e7d32' }]}>
                    {todayWorkout.status === 'completed' ? 'Completed' : 'Planned'}
                  </Text>
                </View>
              </View>
              {todayWorkout.status === 'completed' ? (
                <Text style={styles.cardText}>
                  {todayWorkout.duration_mins ? `${todayWorkout.duration_mins} min` : ''}
                  {todayWorkout.actual_rpe ? `  ·  RPE ${todayWorkout.actual_rpe}` : ''}
                  {todayWorkout.calories_burned ? `  ·  ${Math.round(Number(todayWorkout.calories_burned))} kcal` : ''}
                </Text>
              ) : (
                <Text style={styles.cardText}>
                  {todayWorkout.planned_time
                    ? new Date(todayWorkout.planned_time).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })
                    : ''}
                  {todayWorkout.planned_rpe ? `  ·  RPE ${todayWorkout.planned_rpe}` : ''}
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.cardEmpty}>No workout for today yet.</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/plan-workout')}>
                <Text style={styles.cardLink}>Plan a workout →</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Recommended Nutrition */}
        <Text style={styles.sectionTitle}>Recommended Nutrition</Text>
        <View style={styles.card}>
          {suggestion ? (
            <>
              <Text style={styles.cardTitle}>
                {suggestion.phase === 'pre' ? '🥗 Pre-Workout Fuel' : '💪 Post-Workout Recovery'}
              </Text>
              <View style={styles.macroRow}>
                <Macro styles={styles} label="Carbs" value={`${Math.round(Number(suggestion.suggested_carbs))}g`} />
                <Macro styles={styles} label="Protein" value={`${Math.round(Number(suggestion.suggested_protein))}g`} />
                <Macro styles={styles} label="Fat" value={`${Math.round(Number(suggestion.suggested_fats))}g`} />
                <Macro styles={styles} label="Calories" value={`${Math.round(Number(suggestion.suggested_calories))}`} />
              </View>
              {suggestion.suggestion_text ? (
                <Text style={styles.cardNote}>{suggestion.suggestion_text}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.cardEmpty}>
              Plan or log a workout to get a personalised nutrition recommendation.
            </Text>
          )}
        </View>

        {/* Today's Intake */}
        <Text style={styles.sectionTitle}>Today's Intake</Text>
        <View style={styles.card}>
          {todayMeals.length > 0 ? (
            <>
              <Text style={styles.cardTitle}>
                {Math.round(totals.cals)} kcal  ·  {todayMeals.length} meal{todayMeals.length > 1 ? 's' : ''}
              </Text>
              <MacroBar styles={styles} label="Carbs" value={totals.carbs} target={suggestion ? Number(suggestion.suggested_carbs) : undefined} unit="g" />
              <MacroBar styles={styles} label="Protein" value={totals.protein} target={suggestion ? Number(suggestion.suggested_protein) : undefined} unit="g" />
              <MacroBar styles={styles} label="Fat" value={totals.fat} target={suggestion ? Number(suggestion.suggested_fats) : undefined} unit="g" />
            </>
          ) : (
            <>
              <Text style={styles.cardEmpty}>No meals logged today.</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/log-meal')}>
                <Text style={styles.cardLink}>Log a meal →</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <SettingsDrawer
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onNameChange={(n) => setUser((u) => (u ? { ...u, name: n } : u))}
      />
    </SafeAreaView>
  );
}

function Macro({ styles, label, value }: { styles: any; label: string; value: string }) {
  return (
    <View style={styles.macroCell}>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

function MacroBar({ styles, label, value, target, unit }: { styles: any; label: string; value: number; target?: number; unit: string }) {
  const pct = target && target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>
          {Math.round(value)}{target ? ` / ${Math.round(target)}` : ''}{unit}
        </Text>
      </View>
      {target ? (
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container:      { flex: 1, backgroundColor: c.bg },
    centered:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
    scroll:         { padding: 20 },
    headerRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    greeting:       { fontSize: 15, color: c.subtext },
    name:           { fontSize: 26, fontWeight: '700', color: c.text, marginTop: 2 },
    date:           { fontSize: 13, color: c.muted, marginTop: 4 },
    headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    streakPill:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff5eb', borderColor: '#ffe0c2', borderWidth: 1, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
    streakPillText: { fontSize: 15, fontWeight: '800', color: '#e8710a' },
    iconBtn:        { padding: 6 },
    nudge:          { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.teal, borderRadius: 12, padding: 14, marginBottom: 20 },
    nudgeText:      { color: '#fff', fontSize: 14, fontWeight: '500', flex: 1 },
    sectionTitle:   { fontSize: 13, fontWeight: '600', color: c.subtext, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 8 },
    card:           { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.cardBorder, padding: 16, marginBottom: 20 },
    cardHeaderRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardTitle:      { fontSize: 17, fontWeight: '700', color: c.text, textTransform: 'capitalize' },
    cardText:       { fontSize: 14, color: c.subtext, marginTop: 4 },
    cardNote:       { fontSize: 13, color: c.subtext, marginTop: 10, lineHeight: 19 },
    cardEmpty:      { fontSize: 14, color: c.muted },
    cardLink:       { fontSize: 14, color: c.teal, fontWeight: '600', marginTop: 8 },
    gaugeScore:     { fontSize: 34, fontWeight: '800', marginTop: 2 },
    gaugeOutOf:     { fontSize: 16, fontWeight: '600', color: c.muted },
    gaugeLabel:     { fontSize: 14, fontWeight: '600', color: c.subtext, marginTop: 2 },
    badge:          { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10, backgroundColor: c.track },
    badgePlanned:   {},
    badgeDone:      {},
    badgeText:      { fontSize: 12, fontWeight: '600', color: c.teal },
    macroRow:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    macroCell:      { alignItems: 'center', flex: 1 },
    macroValue:     { fontSize: 18, fontWeight: '700', color: c.teal },
    macroLabel:     { fontSize: 12, color: c.subtext, marginTop: 2 },
    barRow:         { marginTop: 12 },
    barHeader:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    barLabel:       { fontSize: 13, color: c.text, fontWeight: '500' },
    barValue:       { fontSize: 13, color: c.subtext },
    barTrack:       { height: 8, borderRadius: 4, backgroundColor: c.track, overflow: 'hidden' },
    barFill:        { height: 8, borderRadius: 4, backgroundColor: c.teal },
  });
}

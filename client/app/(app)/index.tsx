import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { removeToken } from '../../src/storage/token';
import { getUser, clearUser, StoredUser } from '../../src/storage/user';
import { fetchWorkouts } from '../../src/services/workoutService';
import {
  getLatestSuggestion, getMeals, getLatestRecovery, getReadiness, recordLoginStreak, isSameDay,
  Suggestion, Meal, Recovery, Readiness,
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

// ── Recovery ring (Whoop-style donut: colour + score in the centre) ──
function RecoveryRing({ score, colors }: { score: number; colors: ThemeColors }) {
  const size = 104, stroke = 9, r = 44;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(score, 100)) / 100;
  const color = scoreColor(score);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color }}>{Math.round(score)}</Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: -2 }}>/100</Text>
      </View>
    </View>
  );
}

// ── Workout readiness: an Oura-style status + qualitative contributors ──
// Overall band → hero icon + status word (deliberately no numeric scale).
const READINESS_HERO: Record<Readiness['band'], { icon: keyof typeof Ionicons.glyphMap; status: string; color: string }> = {
  prime:    { icon: 'flash',            status: 'Ready — go hard', color: '#2e7d32' },
  ready:    { icon: 'checkmark-circle', status: 'Ready to train',  color: '#2e7d32' },
  moderate: { icon: 'alert-circle',     status: 'Train easy',      color: '#e8710a' },
  low:      { icon: 'trending-down',    status: 'Take it light',   color: '#c1571a' },
  rest:     { icon: 'bed',              status: 'Rest today',      color: '#c62828' },
};

const GOOD = '#2e7d32', WARN = '#e8710a', BAD = '#c62828';

// Each contributor is shown as a word + colour dot, never a raw number.
function contributorStatus(
  key: 'recovery' | 'fueling' | 'freshness',
  comp: { score: number; stale?: boolean; target_g?: number | null }
): { word: string; color: string } {
  if (key === 'recovery' && comp.stale) return { word: 'Check in', color: WARN };
  if (key === 'fueling' && comp.target_g == null) return { word: 'Log meals', color: WARN };
  if (comp.score >= 70) return { word: 'Good', color: GOOD };
  if (comp.score >= 45) return { word: 'Fair', color: WARN };
  return { word: 'Low', color: BAD };
}

const CONTRIBUTORS: { key: 'recovery' | 'fueling' | 'freshness'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'recovery',  label: 'Recovery',  icon: 'heart' },
  { key: 'fueling',   label: 'Fueling',   icon: 'flame' },
  { key: 'freshness', label: 'Freshness', icon: 'battery-half' },
];

function ReadinessCard({ readiness, styles, colors }: { readiness: Readiness | null; styles: any; colors: ThemeColors }) {
  if (!readiness) {
    return <Text style={styles.cardEmpty}>Log a workout or check-in to see your readiness.</Text>;
  }
  const hero = READINESS_HERO[readiness.band];
  const b = readiness.breakdown;
  // One-line reason = the single most limiting factor.
  const limiting = [b.recovery, b.fueling, b.freshness].reduce((a, c) => (c.score < a.score ? c : a));

  return (
    <View>
      <View style={styles.readinessHero}>
        <View style={[styles.readinessIcon, { backgroundColor: hero.color + '22' }]}>
          <Ionicons name={hero.icon} size={28} color={hero.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.readinessStatus, { color: hero.color }]}>{hero.status}</Text>
          {limiting.note ? <Text style={styles.readinessReason}>{limiting.note}</Text> : null}
        </View>
      </View>

      <View style={styles.readinessDivider}>
        {CONTRIBUTORS.map(({ key, label, icon }) => {
          const st = contributorStatus(key, b[key]);
          return (
            <View key={key} style={styles.contribRow}>
              <View style={styles.contribLeft}>
                <Ionicons name={icon} size={17} color={colors.muted} />
                <Text style={styles.contribLabel}>{label}</Text>
              </View>
              <View style={styles.contribRight}>
                <View style={[styles.contribDot, { backgroundColor: st.color }]} />
                <Text style={[styles.contribWord, { color: st.color }]}>{st.word}</Text>
              </View>
            </View>
          );
        })}
      </View>
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
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [lastWorkout, setLastWorkout] = useState<any | null>(null);
  const [streak, setStreak] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [u, w, m, s, rec, rdy, days] = await Promise.all([
        getUser(),
        fetchWorkouts().catch(() => []),
        getMeals().catch(() => []),
        getLatestSuggestion().catch(() => null),
        getLatestRecovery().catch(() => null),
        getReadiness().catch(() => null),
        recordLoginStreak().catch(() => 0),
      ]);
      setUser(u);
      setWorkouts(w);
      setMeals(m);
      setSuggestion(s);
      setRecovery(rec);
      setReadiness(rdy);
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

        {/* Workout readiness */}
        <Text style={styles.sectionTitle}>Workout Readiness</Text>
        <View style={styles.card}>
          <ReadinessCard readiness={readiness} styles={styles} colors={colors} />
        </View>

        {/* Recovery ring */}
        <Text style={styles.sectionTitle}>Recovery</Text>
        <View style={styles.card}>
          {recovery ? (
            <View style={styles.recoveryRow}>
              <RecoveryRing score={Number(recovery.recovery_score)} colors={colors} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recoveryTitle}>{scoreLabel(Number(recovery.recovery_score))}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.cardEmpty}>No recovery check-in logged yet.</Text>
          )}
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
    recoveryRow:     { flexDirection: 'row', alignItems: 'center', gap: 18 },
    recoveryTitle:   { fontSize: 18, fontWeight: '700', color: c.text },
    readinessHero:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
    readinessIcon:   { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    readinessStatus: { fontSize: 20, fontWeight: '800' },
    readinessReason: { fontSize: 13, color: c.subtext, marginTop: 2, lineHeight: 18 },
    readinessDivider:{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.cardBorder, gap: 12 },
    contribRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    contribLeft:     { flexDirection: 'row', alignItems: 'center', gap: 9 },
    contribLabel:    { fontSize: 14, color: c.text },
    contribRight:    { flexDirection: 'row', alignItems: 'center', gap: 7 },
    contribDot:      { width: 8, height: 8, borderRadius: 4 },
    contribWord:     { fontSize: 13, fontWeight: '600' },
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

export interface Suggestion {
  id: number;
  workout_id: number;
  phase: 'pre' | 'post';
  suggestion_text: string;
  suggested_carbs: number;
  suggested_protein: number;
  suggested_fats: number;
  suggested_calories: number;
  created_at: string;
}

export interface Meal {
  id: number;
  meal_name: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_at: string;
}

export interface Recovery {
  workout_id: number;
  recovery_score: number;
  checkin_date: string;
}

export const getLatestSuggestion = async (): Promise<Suggestion | null> => {
  const res = await api.get('/suggestions/latest');
  return res.data?.suggestion ?? null;
};

export const getMeals = async (): Promise<Meal[]> => {
  const res = await api.get('/meals');
  return res.data?.meals ?? [];
};

// Returns the recovery check-in for a workout, or null if none logged yet.
export const getRecoveryForWorkout = async (workoutId: number): Promise<Recovery | null> => {
  try {
    const res = await api.get(`/recovery/${workoutId}`);
    return res.data?.checkin ?? null;
  } catch {
    return null; // 404 = no check-in yet
  }
};

// Most recent recovery check-in overall (for the home gauge).
export const getLatestRecovery = async (): Promise<Recovery | null> => {
  try {
    const res = await api.get('/recovery/latest');
    return res.data?.checkin ?? null;
  } catch {
    return null;
  }
};

export function isSameDay(iso: string | null | undefined, ref = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.toDateString() === ref.toDateString();
}

// App-usage streak: consecutive days the user has opened the app. Call once
// when the home screen loads; it records today and returns the current streak.
const STREAK_KEY = 'fuelsync_login_streak';

export async function recordLoginStreak(): Promise<number> {
  const today = new Date();
  const todayStr = today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  let count = 1;
  let lastDate = '';
  const raw = await AsyncStorage.getItem(STREAK_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      count = parsed.count ?? 1;
      lastDate = parsed.lastDate ?? '';
    } catch {
      /* ignore corrupt value */
    }
  }

  if (lastDate === todayStr) {
    return count;                    // already counted today
  }
  count = lastDate === yesterdayStr ? count + 1 : 1;  // extend or reset
  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ lastDate: todayStr, count }));
  return count;
}

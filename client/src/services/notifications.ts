import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const TZ_STORAGE_KEY = 'fuelsync_last_known_timezone';
const PENDING_CHECKIN_KEY = 'fuelsync_pending_checkin_workout_id';

export async function ensureNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('recovery-checkin', {
      name: 'Recovery Check-In',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  return finalStatus === 'granted';
}

function getCurrentDeviceTimezone(): string {
  return Localization.getCalendars()[0]?.timeZone ?? 'UTC';
}

async function scheduleAt9amLocal(workoutId: number) {
  const tomorrow9am = new Date();
  tomorrow9am.setDate(tomorrow9am.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'How are you feeling?',
      body: "Log your recovery check-in from yesterday's workout.",
      data: { workoutId, type: 'recovery_checkin' },
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: tomorrow9am,
    },
  });
}

export async function scheduleRecoveryCheckinReminder(workoutId: number) {
  const granted = await ensureNotificationPermissions();
  if (!granted) return null;

  await cancelRecoveryCheckinReminder(workoutId);
  const id = await scheduleAt9amLocal(workoutId);

  await AsyncStorage.setItem(TZ_STORAGE_KEY, getCurrentDeviceTimezone());
  await AsyncStorage.setItem(PENDING_CHECKIN_KEY, String(workoutId));

  return id;
}

export async function cancelRecoveryCheckinReminder(workoutId: number) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const match = scheduled.find(
    (n) => n.content.data?.workoutId === workoutId &&
           n.content.data?.type === 'recovery_checkin'
  );
  if (match) {
    await Notifications.cancelScheduledNotificationAsync(match.identifier);
  }
}

export function initTimezoneChangeWatcher() {
  const subscription = AppState.addEventListener('change', async (state) => {
    if (state !== 'active') return;

    const [lastTz, pendingWorkoutId] = await Promise.all([
      AsyncStorage.getItem(TZ_STORAGE_KEY),
      AsyncStorage.getItem(PENDING_CHECKIN_KEY),
    ]);

    const currentTz = getCurrentDeviceTimezone();

    if (pendingWorkoutId && lastTz && currentTz !== lastTz) {
      await scheduleRecoveryCheckinReminder(Number(pendingWorkoutId));
    } else if (currentTz !== lastTz) {
      await AsyncStorage.setItem(TZ_STORAGE_KEY, currentTz);
    }
  });

  return () => subscription.remove();
}

export async function clearPendingCheckinFlag() {
  await AsyncStorage.removeItem(PENDING_CHECKIN_KEY);
}
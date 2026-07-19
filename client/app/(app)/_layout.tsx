import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { initTimezoneChangeWatcher } from '../../src/services/notifications';
import { getUser, StoredUser } from '../../src/storage/user';

export default function AppLayout() {
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
  const cleanup = initTimezoneChangeWatcher();
  return cleanup;
}, []);

  // Tapping the recovery-check-in reminder opens the Check-in screen.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'recovery_checkin') {
        router.push('/(app)/check-in');
      }
    });
    return () => sub.remove();
  }, []);

useEffect(() => {
  getUser().then(setUser);
}, []);

useEffect(() => {
  if (user && !user.onboarding_metrics_done) {
    router.push('/(modals)/onboarding-metrics');
  }
}, [user]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#01696f',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#eee' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan-workout"
        options={{
          title: 'Workout',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="log-meal"
        options={{
          title: 'Log Meal',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: 'Check-in',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="[workoutDetail]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="nutrientrec"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
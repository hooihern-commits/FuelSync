import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { getToken } from '../src/storage/token';

export default function RootLayout() {
  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await getToken();
        if (token) {
          router.replace('/(app)');
        } else {
          router.replace('/(auth)/login');
        }
      } catch (e) {
        router.replace('/(auth)/login');
      }
    };
    checkToken();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen
        name="(modals)/onboarding-metrics"
        options={{ presentation: 'modal', gestureEnabled: false }}
      />
    </Stack>
  );
}
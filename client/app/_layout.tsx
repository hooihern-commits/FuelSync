import { useEffect } from 'react';
import { Slot, router } from 'expo-router';
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

  return <Slot />;
}
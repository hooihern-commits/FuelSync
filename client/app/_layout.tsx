import { useEffect, useState } from 'react';
import { Slot, router, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  const [checking, setChecking] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const checkToken = async () => {
      if (pathname !== '/') {
        setChecking(false);
        return;
      }

      const token = await AsyncStorage.getItem('token');
      if (token) {
        router.replace('/(app)/');
      } else {
        router.replace('/(auth)/login');
      }
      setChecking(false);
    };

    checkToken();
  }, [pathname]);

  if (checking && pathname === '/') return null;

  return <Slot />;
}
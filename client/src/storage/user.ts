import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoredUser {
  id: number;
  name: string;
  email: string;
  onboarding_metrics_done: boolean;
}

export async function saveUser(user: StoredUser) {
  await AsyncStorage.setItem('user', JSON.stringify(user));
}

export async function getUser(): Promise<StoredUser | null> {
  const raw = await AsyncStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export async function clearUser() {
  await AsyncStorage.removeItem('user');
}
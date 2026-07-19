import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import BodyMetricsForm from '../../src/components/BodyMetricsForm';
import { logBodyMetrics, completeOnboarding } from '../../src/api/bodyMetrics';
import { getUser, saveUser } from '../../src/storage/user';

export default function OnboardingMetrics() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (height: string, weight: string) => {
    const weightNum = parseFloat(weight);
    const heightNum = height ? parseFloat(height) : null;

    if (!weightNum || weightNum <= 0) {
      Alert.alert('Weight required', 'Please enter a valid weight.');
      return;
    }

    setLoading(true);
    try {
      await logBodyMetrics(heightNum, weightNum);
      await completeOnboarding();

      const currentUser = await getUser();
      if (currentUser) {
        await saveUser({ ...currentUser, onboarding_metrics_done: true });
      }

      router.replace('/(app)');
    } catch (err) {
      Alert.alert('Error', 'Could not save your details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false, headerBackVisible: false, headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Welcome to FuelSync</Text>
        <Text style={styles.subtitle}>
          Tell us your height and weight so we can personalise your nutrition suggestions.
        </Text>
        <BodyMetricsForm onSubmit={handleSubmit} submitLabel={loading ? 'Saving...' : 'Continue'} />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingBottom: 48, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8, marginBottom: 16 },
});
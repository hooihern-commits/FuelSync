import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BodyMetricsForm from '../../src/components/BodyMetricsForm';
import { logBodyMetrics, getLatestMetrics } from '../../src/api/bodyMetrics';

export default function Profile() {
  const [initialHeight, setInitialHeight] = useState('');
  const [initialWeight, setInitialWeight] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getLatestMetrics().then((latest) => {
      if (latest) {
        setInitialHeight(latest.height_cm?.toString() ?? '');
        setInitialWeight(latest.weight_kg?.toString() ?? '');
      }
    });
  }, []);

  const handleSubmit = async (height: string, weight: string) => {
    const weightNum = parseFloat(weight);
    const heightNum = height ? parseFloat(height) : null;
    if (!weightNum || weightNum <= 0) return;

    await logBodyMetrics(heightNum, weightNum);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Update your body metrics</Text>
      <BodyMetricsForm
        initialHeight={initialHeight}
        initialWeight={initialWeight}
        onSubmit={handleSubmit}
        heightOptional
      />
      {saved && <Text style={styles.savedText}>Saved ✓</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingBottom: 48, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4, marginBottom: 16 },
  savedText: { color: '#01696f', marginTop: 12, fontSize: 14 },
});
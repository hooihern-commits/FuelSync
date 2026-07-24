import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BodyMetricsForm from '../../src/components/BodyMetricsForm';
import { logBodyMetrics, getLatestMetrics } from '../../src/api/bodyMetrics';
import { useTheme, ThemeColors } from '../../src/theme';

export default function Profile() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, padding: 24, paddingBottom: 48, backgroundColor: c.bg },
    title: { fontSize: 28, fontWeight: 'bold', color: c.text },
    subtitle: { fontSize: 14, color: c.subtext, marginTop: 4, marginBottom: 16 },
    savedText: { color: c.teal, marginTop: 12, fontSize: 14 },
  });
}
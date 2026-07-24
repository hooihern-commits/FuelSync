import { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import BodyMetricsForm from '../../src/components/BodyMetricsForm';
import { logBodyMetrics, completeOnboarding } from '../../src/api/bodyMetrics';
import { getUser, saveUser } from '../../src/storage/user';
import { useTheme, ThemeColors } from '../../src/theme';
import DismissKeyboard from '../../src/components/DismissKeyboard';

export default function OnboardingMetrics() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [age, setAge] = useState('');

  const handleSubmit = async (height: string, weight: string) => {
    const weightNum = parseFloat(weight);
    const heightNum = height ? parseFloat(height) : null;
    const ageNum = parseInt(age, 10);

    if (!weightNum || weightNum <= 0) {
      Alert.alert('Weight required', 'Please enter a valid weight.');
      return;
    }
    if (!ageNum || ageNum <= 0 || ageNum > 120) {
      Alert.alert('Age required', 'Please enter a valid age.');
      return;
    }

    setLoading(true);
    try {
      await logBodyMetrics(heightNum, weightNum);
      await completeOnboarding(ageNum);

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
      <DismissKeyboard>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Welcome to FuelSync</Text>
        <Text style={styles.subtitle}>
          Tell us your age, height and weight so we can personalise your nutrition suggestions.
        </Text>
        <Text style={styles.label}>Age</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={age}
          onChangeText={setAge}
          placeholder="e.g. 25"
          placeholderTextColor={colors.muted}
        />
        <BodyMetricsForm onSubmit={handleSubmit} submitLabel={loading ? 'Saving...' : 'Continue'} />
      </SafeAreaView>
      </DismissKeyboard>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, padding: 24, paddingBottom: 48, backgroundColor: c.bg },
    title: { fontSize: 28, fontWeight: 'bold', color: c.text },
    subtitle: { fontSize: 14, color: c.subtext, marginTop: 8, marginBottom: 16 },
    label: { fontSize: 14, color: c.subtext, marginBottom: 6, marginTop: 16 },
    input: { borderWidth: 1, borderColor: c.inputBorder, backgroundColor: c.inputBg, borderRadius: 10, padding: 14, fontSize: 16, color: c.text },
  });
}
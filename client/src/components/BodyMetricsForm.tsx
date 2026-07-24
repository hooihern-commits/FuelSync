import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, ThemeColors } from '../theme';

interface Props {
  initialHeight?: string;
  initialWeight?: string;
  onSubmit: (height: string, weight: string) => void;
  submitLabel?: string;
  heightOptional?: boolean;
}

export default function BodyMetricsForm({
  initialHeight = '',
  initialWeight = '',
  onSubmit,
  submitLabel = 'Save',
  heightOptional = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [height, setHeight] = useState(initialHeight);
  const [weight, setWeight] = useState(initialWeight);

  return (
    <View>
      <Text style={styles.label}>Height (cm){heightOptional ? ' (optional)' : ''}</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={height}
        onChangeText={setHeight}
        placeholder="e.g. 175"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Weight (kg)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={setWeight}
        placeholder="e.g. 70"
        placeholderTextColor={colors.muted}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={() => onSubmit(height, weight)}
      >
        <Text style={styles.buttonText}>{submitLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    label: { fontSize: 14, color: c.subtext, marginBottom: 6, marginTop: 16 },
    input: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      backgroundColor: c.inputBg,
      borderRadius: 10,
      padding: 14,
      fontSize: 16,
      color: c.text,
    },
    button: {
      backgroundColor: c.teal,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
      marginTop: 24,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  });
}
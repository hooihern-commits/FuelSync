import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, ThemeColors } from '../../src/theme';

type Props = {
  value: number | string | null | undefined;
  unit: string;
  label: string;
  color: string;
};

const SIZE = 72;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function NutrientRec({ value, unit, label, color }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const hasValue = value !== null && value !== undefined && value !== '';
  const fillRatio = hasValue ? 0.7 : 0;
  const dashOffset = CIRCUMFERENCE * (1 - fillRatio);

  return (
    <View style={styles.wrap}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.track}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
            {hasValue ? value : '—'}
          </Text>
          {hasValue && <Text style={styles.unit}>{unit}</Text>}
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}
function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap:   { alignItems: 'center', width: 76 },
    center: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
    },
    value:  { fontSize: 16, fontWeight: '700' },
    unit:   { fontSize: 10, color: c.muted, marginTop: -2 },
    label:  { fontSize: 13, color: c.text, marginTop: 8, fontWeight: '600' },
  });
}
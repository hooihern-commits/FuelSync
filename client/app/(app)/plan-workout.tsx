import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';
import api from '../../src/api/client';

export default function PlanWorkoutScreen() {
  const [workoutType, setWorkoutType] = useState('running');
  const [plannedTime, setPlannedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [plannedRpe, setPlannedRpe] = useState(5);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);

  const formattedTime = plannedTime.toLocaleString();

  const onDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setPlannedTime(selectedDate);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setSuggestion(null);

      const workoutResponse = await api.post('/workouts', {
        planned_type: workoutType,
        planned_time: plannedTime.toISOString(),
        planned_rpe: plannedRpe,
      });

      const workoutId =
        workoutResponse.data?.workout?.id ??
        workoutResponse.data?.id ??
        workoutResponse.data?.workout_id;

      if (!workoutId) {
        throw new Error('Workout was created, but no workout ID was returned.');
      }

      const suggestionResponse = await api.post('/suggestions/pre', {
        workout_id: workoutId,
      });

      setSuggestion(suggestionResponse.data);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.message || error.message || 'Something went wrong'
      );
    } finally {
      setLoading(false);
    }
  };

  const suggestionData = suggestion?.suggestion ?? suggestion;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Plan Workout</Text>
        <Text style={styles.subtitle}>
          Input your workout details, then get a pre-workout nutrition suggestion.
        </Text>

        <Text style={styles.label}>Workout Type</Text>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={workoutType}
            onValueChange={(value) => setWorkoutType(value)}
            style={{ color: '#01696f' }} 
          >
            <Picker.Item label="Running" value="running" color="#01696f" />
            <Picker.Item label="Cycling" value="cycling" color="#01696f" />
            <Picker.Item label="Swimming" value="swimming" color="#01696f" />
            <Picker.Item label="Gym" value="gym" color="#01696f" />
            <Picker.Item label="Football" value="football" color="#01696f" />
            <Picker.Item label="Basketball" value="basketball" color="#01696f" />
            <Picker.Item label="Badminton" value="badminton" color="#01696f" />
            <Picker.Item label="Tennis" value="tennis" color="#01696f" />
            <Picker.Item label="Other" value="other" color="#01696f" />
          </Picker>
        </View>

        <Text style={styles.label}>Planned Date & Time</Text>
        <TouchableOpacity style={styles.inputLike} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.inputLikeText}>{formattedTime}</Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={plannedTime}
            mode="datetime"
            display="default"
            onChange={onDateChange}
          />
        )}

        <Text style={styles.label}>Planned RPE: {plannedRpe}</Text>
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={plannedRpe}
          onValueChange={(value) => setPlannedRpe(value)}
          minimumTrackTintColor="#01696f"
          maximumTrackTintColor="#d3d3d3"
          thumbTintColor="#01696f"
        />
        <View style={styles.rpeRow}>
          <Text>1</Text>
          <Text>10</Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Plan Workout</Text>
          )}
        </TouchableOpacity>

        {suggestionData ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pre-Workout Suggestion</Text>
            <Text style={styles.cardText}>Carbs: {suggestionData.carbs_g ?? '—'} g</Text>
            <Text style={styles.cardText}>Protein: {suggestionData.protein_g ?? '—'} g</Text>
            <Text style={styles.cardText}>Hydration: {suggestionData.hydration_ml ?? '—'} ml</Text>
            {suggestionData.notes ? (
              <Text style={styles.cardText}>Notes: {suggestionData.notes}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  pickerBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f4f8f8',
  },
  inputLike: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
  },
  inputLikeText: {
    fontSize: 16,
    color: '#111',
  },
  rpeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#01696f',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f4f8f8',
    borderWidth: 1,
    borderColor: '#d8e7e7',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    color: '#01696f',
  },
  cardText: {
    fontSize: 15,
    marginBottom: 6,
    color: '#222',
  },
});
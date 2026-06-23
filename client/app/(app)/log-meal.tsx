import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { analyzeFoodPhoto, FoodScanResult } from '../../src/api/foodAI';
import apiClient from '../../src/api/client';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

type MealType = 'pre_workout' | 'post_workout' | 'general';

const MEAL_TYPES: { label: string; value: MealType }[] = [
  { label: 'Pre-Workout', value: 'pre_workout' },
  { label: 'Post-Workout', value: 'post_workout' },
  { label: 'General', value: 'general' },
];

export default function LogMealScreen() {
  const { suggestion_id, meal_type: incomingMealType } = useLocalSearchParams();
  const suggestionId = suggestion_id ? parseInt(suggestion_id as string) : null; 
  const [mealType, setMealType] = useState<MealType>((incomingMealType as MealType) ?? 'general');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState(4 / 3);

  // Form fields
  const [mealName, setMealName] = useState('');
  const [calories, setCalories] = useState('');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [notes, setNotes] = useState('');

  const fillFromScan = (result: FoodScanResult) => {
    setMealName(result.meal_name);
    setCalories(String(result.calories_kcal));
    setCarbs(String(result.carbs_g));
    setProtein(String(result.protein_g));
    setFat(String(result.fat_g));
    setConfidence(result.confidence);
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera access is required to scan meals.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      const { width, height } = result.assets[0];
      if (width && height) setImageAspectRatio(width / height);
      setConfidence(null);
    }
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      const { width, height } = result.assets[0];
      if (width && height) setImageAspectRatio(width / height);
      setConfidence(null);
    }
  };

  const handleScanWithAI = async () => {
    if (!imageUri) return;
    setScanning(true);
    try {
      const result = await analyzeFoodPhoto(imageUri);
      fillFromScan(result);
    } catch (e: any) {
    console.log('Scan error:', JSON.stringify(e?.response?.data ?? e?.message ?? e));
    Alert.alert('Scan failed', e?.response?.data?.error?.message ?? e?.message ?? 'Unknown error');
  } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async () => {
    if (!mealName || !calories) {
      Alert.alert('Missing info', 'Please enter at least a meal name and calories.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/meals/log', {
        meal_type: mealType,
        meal_name: mealName,
        calories_kcal: parseFloat(calories) || 0,
        carbs_g: parseFloat(carbs) || 0,
        protein_g: parseFloat(protein) || 0,
        fat_g: parseFloat(fat) || 0,
        notes: notes || null,
        data_source: imageUri ? 'ai_vision' : 'manual',
        logged_at: new Date().toISOString(),
        suggestion_id: suggestionId ?? null,
      });
      Alert.alert('✅ Meal logged!', `${mealName} has been recorded.`);
      // Reset form
      setImageUri(null);
      setMealName(''); setCalories(''); setCarbs('');
      setProtein(''); setFat(''); setNotes(''); setConfidence(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to log meal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView  style={styles.container} >
      <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Log Meal</Text>
      <Text style={styles.subtitle}>Track what you eat around your workouts.</Text>

      {/* Meal Type Toggle */}
      <View style={styles.pillRow}>
        {MEAL_TYPES.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.pill, mealType === t.value && styles.pillActive]}
            onPress={() => setMealType(t.value)}
          >
            <Text style={[styles.pillText, mealType === t.value && styles.pillTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Photo Section */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Scan with AI</Text>
        <View style={styles.photoButtons}>
          <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto}>
            <Text style={styles.photoBtnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto}>
            <Text style={styles.photoBtnText}>From Library</Text>
          </TouchableOpacity>
        </View>

        {imageUri && (
          <>
            <Image source={{ uri: imageUri }} style={[styles.preview, { aspectRatio: imageAspectRatio }]} resizeMode="contain" />
            <TouchableOpacity
              style={[styles.scanBtn, scanning && { opacity: 0.6 }]}
              onPress={handleScanWithAI}
              disabled={scanning}
            >
              {scanning
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.scanBtnText}>Scan with AI</Text>
              }
            </TouchableOpacity>
            {confidence && (
              <Text style={styles.confidence}>
                AI confidence: <Text style={{ fontWeight: '600' }}>{confidence}</Text>
                {' '}— review fields below before logging
              </Text>
            )}
          </>
        )}
      </View>

      {/* Manual / AI-filled Fields */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Nutrition Details</Text>

        <Text style={styles.label}>Meal Name</Text>
        <TextInput style={styles.input} value={mealName} onChangeText={setMealName} placeholder="e.g. Chicken rice" multiline />

        <Text style={styles.label}>Calories (kcal)</Text>
        <TextInput style={styles.input} value={calories} onChangeText={setCalories} keyboardType="numeric" placeholder="0" />

        <View style={styles.row}>
          <View style={styles.thirdField}>
            <Text style={styles.label}>Carbs (g)</Text>
            <TextInput style={styles.input} value={carbs} onChangeText={setCarbs} keyboardType="numeric" placeholder="0" />
          </View>
          <View style={styles.thirdField}>
            <Text style={styles.label}>Protein (g)</Text>
            <TextInput style={styles.input} value={protein} onChangeText={setProtein} keyboardType="numeric" placeholder="0" />
          </View>
          <View style={styles.thirdField}>
            <Text style={styles.label}>Fat (g)</Text>
            <TextInput style={styles.input} value={fat} onChangeText={setFat} keyboardType="numeric" placeholder="0" />
          </View>
        </View>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any additional context..."
          multiline
        />
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.submitBtnText}>Log Meal</Text>
        }
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  pillRow: { flexDirection: 'row', backgroundColor: '#f4f8f8', borderRadius: 10, padding: 4, marginBottom: 20 },
  pill: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  pillActive: { backgroundColor: '#01696f' },
  pillText: { fontSize: 13, color: '#666', fontWeight: '500' },
  pillTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#f4f8f8', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#d8e7e7' },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#01696f', marginBottom: 12 },
  photoButtons: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  photoBtn: { flex: 1, borderWidth: 1, borderColor: '#01696f', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  photoBtnText: { color: '#01696f', fontWeight: '600', fontSize: 14 },
  preview: { width: '100%', borderRadius: 10, marginBottom: 12 },
  scanBtn: { backgroundColor: '#01696f', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  confidence: { fontSize: 12, color: '#666', textAlign: 'center' },
  label: { fontSize: 13, color: '#666', marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 14, backgroundColor: '#fff', minHeight: 48,textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  thirdField: { flex: 1 },
  submitBtn: { backgroundColor: '#01696f', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
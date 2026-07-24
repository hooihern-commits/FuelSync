import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Switch, Alert, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { getUser, saveUser } from '../storage/user';
import { updateProfile, changePassword } from '../api/profile';
import { logBodyMetrics, getLatestMetrics } from '../api/bodyMetrics';

const WIDTH = Math.min(Dimensions.get('window').width * 0.85, 360);

interface Props {
  visible: boolean;
  onClose: () => void;
  onNameChange?: (name: string) => void;
}

export default function SettingsDrawer({ visible, onClose, onNameChange }: Props) {
  const { dark, colors, toggle } = useTheme();
  const tx = useRef(new Animated.Value(WIDTH)).current;
  const [render, setRender] = useState(visible);

  const [name, setName] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setRender(true);
      Animated.timing(tx, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      getUser().then((u) => setName(u?.name ?? ''));
      getLatestMetrics()
        .then((m) => {
          if (m) {
            setHeight(m.height_cm != null ? String(m.height_cm) : '');
            setWeight(m.weight_kg != null ? String(m.weight_kg) : '');
          }
        })
        .catch(() => {});
    } else {
      Animated.timing(tx, { toValue: WIDTH, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => finished && setRender(false)
      );
    }
  }, [visible]);

  const saveName = async () => {
    if (!name.trim()) return Alert.alert('Name required', 'Please enter a name.');
    try {
      setBusy('name');
      const updated = await updateProfile(name.trim());
      const u = await getUser();
      if (u) await saveUser({ ...u, name: updated.name });
      onNameChange?.(updated.name);
      Alert.alert('Saved', 'Your name has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not update name.');
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async () => {
    if (!curPw || !newPw) return Alert.alert('Missing fields', 'Enter your current and new password.');
    if (newPw.length < 6) return Alert.alert('Weak password', 'New password must be at least 6 characters.');
    try {
      setBusy('pw');
      await changePassword(curPw, newPw);
      setCurPw('');
      setNewPw('');
      Alert.alert('Saved', 'Your password has been changed.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not change password.');
    } finally {
      setBusy(null);
    }
  };

  const saveMetrics = async () => {
    const w = parseFloat(weight);
    const h = height ? parseFloat(height) : null;
    if (!w || w <= 0) return Alert.alert('Weight required', 'Please enter a valid weight.');
    try {
      setBusy('metrics');
      await logBodyMetrics(h, w);
      Alert.alert('Saved', 'Your body metrics have been updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not update metrics.');
    } finally {
      setBusy(null);
    }
  };

  const s = makeStyles(colors);

  return (
    <Modal visible={render} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <Animated.View style={[s.panel, { transform: [{ translateX: tx }] }]}>
        <SafeTop />
        <View style={s.header}>
          <Text style={s.title}>Settings</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {/* Profile */}
          <Text style={s.sectionLabel}>Profile</Text>
          <Text style={s.fieldLabel}>Name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.muted} />
          <SaveButton label="Save Name" onPress={saveName} loading={busy === 'name'} colors={colors} />

          {/* Password */}
          <Text style={s.sectionLabel}>Change Password</Text>
          <Text style={s.fieldLabel}>Current password</Text>
          <TextInput style={s.input} value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} />
          <Text style={s.fieldLabel}>New password</Text>
          <TextInput style={s.input} value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="At least 6 characters" placeholderTextColor={colors.muted} />
          <SaveButton label="Update Password" onPress={savePassword} loading={busy === 'pw'} colors={colors} />

          {/* Body metrics */}
          <Text style={s.sectionLabel}>Body Metrics</Text>
          <Text style={s.fieldLabel}>Height (cm)</Text>
          <TextInput style={s.input} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="e.g. 175" placeholderTextColor={colors.muted} />
          <Text style={s.fieldLabel}>Weight (kg)</Text>
          <TextInput style={s.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="e.g. 70" placeholderTextColor={colors.muted} />
          <SaveButton label="Save Metrics" onPress={saveMetrics} loading={busy === 'metrics'} colors={colors} />

          {/* Appearance */}
          <Text style={s.sectionLabel}>Appearance</Text>
          <View style={s.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={dark ? 'moon' : 'sunny'} size={20} color={colors.teal} />
              <Text style={s.rowText}>Dark theme</Text>
            </View>
            <Switch value={dark} onValueChange={toggle} trackColor={{ true: colors.teal }} />
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function SafeTop() {
  return <View style={{ height: 44 }} />;
}

function SaveButton({ label, onPress, loading, colors }: { label: string; onPress: () => void; loading: boolean; colors: any }) {
  return (
    <TouchableOpacity
      style={{ backgroundColor: colors.teal, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 }}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{label}</Text>}
    </TouchableOpacity>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    panel: {
      position: 'absolute', top: 0, bottom: 0, right: 0, width: WIDTH,
      backgroundColor: c.bg, paddingHorizontal: 20,
      shadowColor: '#000', shadowOffset: { width: -2, height: 0 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 12,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 24, fontWeight: '800', color: c.text },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 24, marginBottom: 8 },
    fieldLabel: { fontSize: 13, color: c.subtext, marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderColor: c.inputBorder, backgroundColor: c.inputBg, borderRadius: 10, padding: 12, fontSize: 15, color: c.text },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    rowText: { fontSize: 15, color: c.text, fontWeight: '500' },
  });
}

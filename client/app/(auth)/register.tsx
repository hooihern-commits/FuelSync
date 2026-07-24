import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import api from '../../src/api/client';
import { saveToken } from '../../src/storage/token';
import { saveUser } from '../../src/storage/user';
import { useTheme, ThemeColors } from '../../src/theme';
import DismissKeyboard from '../../src/components/DismissKeyboard';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/register', { name, email, password });
      await saveToken(response.data.token);
      await saveUser(response.data.user);
      router.replace('/(app)');
    } catch (error: any) {
      Alert.alert('Registration Failed', error.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DismissKeyboard>
      <View style={styles.container}>
      <Text style={styles.title}>FuelSync</Text>
      <Text style={styles.subtitle}>Create your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        placeholderTextColor={colors.muted}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor={colors.muted}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor={colors.muted}
      />

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
      </View>
    </DismissKeyboard>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: c.bg },
    title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: c.text },
    subtitle: { fontSize: 16, textAlign: 'center', color: c.subtext, marginBottom: 32 },
    input: { borderWidth: 1, borderColor: c.inputBorder, backgroundColor: c.inputBg, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16, color: c.text },
    button: { backgroundColor: c.teal, borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    link: { textAlign: 'center', color: c.teal, fontSize: 14 },
  });
}
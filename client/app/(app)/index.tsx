import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { removeToken } from '../../src/storage/token';

export default function HomeScreen() {
  console.log('HomeScreen rendered');
  
  const handleLogout = async () => {
    await removeToken();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, marginBottom: 24 }}>Home Screen</Text>
        <TouchableOpacity
          onPress={handleLogout}
          style={{ backgroundColor: '#01696f', padding: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 16 }}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
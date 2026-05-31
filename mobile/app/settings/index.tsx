import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth';

const ITEMS = [
  { label: '📧 Email Settings', path: '/settings/email' },
  { label: '🔒 Security (2FA, PIN)', path: '/settings/security' },
  { label: '📥 Import from Goodreads', path: '/settings/import' },
  { label: '✍️ Verify Author Status', path: '/settings/verify-author' },
  { label: '🗂️ Account & Data', path: '/settings/account' },
] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user } = useAuthStore();

  function confirmLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        {user && (
          <View className="px-4 py-4 border-b border-border mb-2">
            <Text className="font-semibold text-foreground">{user.display_name}</Text>
            <Text className="text-sm text-muted-foreground">@{user.username}</Text>
          </View>
        )}

        {ITEMS.map(({ label, path }) => (
          <TouchableOpacity
            key={path}
            onPress={() => router.push(path)}
            className="flex-row items-center justify-between px-4 py-4 border-b border-border"
            activeOpacity={0.7}
          >
            <Text className="text-foreground">{label}</Text>
            <Text className="text-muted-foreground">›</Text>
          </TouchableOpacity>
        ))}

        <View className="px-4 mt-8">
          <TouchableOpacity
            onPress={confirmLogout}
            className="border border-destructive rounded-xl py-3 items-center"
            activeOpacity={0.7}
          >
            <Text className="text-destructive font-semibold">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

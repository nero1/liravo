import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth';
import {LocaleSwitcher} from '@/components/ui/LocaleSwitcher';

const ITEMS = [
  { label: 'email', path: '/settings/email' },
  { label: 'security', path: '/settings/security' },
  { label: 'import', path: '/settings/import' },
  { label: 'verify', path: '/settings/verify-author' },
  { label: 'account', path: '/settings/account' },
] as const;

export default function SettingsScreen() {
  const {t}=useTranslations('settings');
  const router = useRouter(),{t:common}=useTranslations('common');
  const { logout } = useAuth();
  const { user } = useAuthStore();

  function confirmLogout() {
    Alert.alert(t('signOut'),t('confirmSignOut'), [
      { text: common('cancel'), style: 'cancel' },
      { text: t('signOut'), style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        <LocaleSwitcher/>
        {user && (
          <View className="px-4 py-4 border-b border-border mb-2">
            <Text className="font-semibold text-foreground">{user.display_name}</Text>
            <Text className="text-sm text-muted-foreground">@{user.username}</Text>
          </View>
        )}

        {ITEMS.map(({ label, path }) => (
          <TouchableOpacity accessibilityRole="link"
            key={path}
            onPress={() => router.push(path)}
            className="flex-row items-center justify-between px-4 py-4 border-b border-border"
            activeOpacity={0.7}
          >
            <Text className="text-foreground">{t(label)}</Text>
            <Text className="text-muted-foreground">›</Text>
          </TouchableOpacity>
        ))}

        <View className="px-4 mt-8">
          <TouchableOpacity accessibilityRole="button"
            onPress={confirmLogout}
            className="border border-destructive rounded-xl py-3 items-center"
            activeOpacity={0.7}
          >
            <Text className="text-destructive font-semibold">{t('signOut')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

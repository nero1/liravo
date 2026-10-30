import {useTranslations} from '@/hooks/useTranslations';
import { Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const ADMIN_ITEMS = [
  { emoji: '👥', label: 'users', path: '/admin/users' },
  { emoji: '📚', label: 'books', path: '/admin/books' },
  { emoji: '🚩', label: 'featureFlags', path: '/admin/feature-flags' },
  { emoji: '🔗', label: 'affiliateStores', path: '/admin/affiliate-stores' },
  { emoji: '📣', label: 'promotedListings', path: '/admin/promoted-listings' },
  { emoji: '🎉', label: 'seasonalEvents', path: '/admin/seasonal-events' },
  { emoji: '✍️', label: 'writingChallenges', path: '/admin/writing-challenges' },
  { emoji: '🎨', label: 'theme', path: '/admin/theme' },
  { emoji: '⏱️', label: 'cronStatus', path: '/admin/cron-status' },
] as const;

export default function AdminScreen() {
  const router = useRouter(),{t}=useTranslations('admin');
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {ADMIN_ITEMS.map(({ emoji, label, path }) => (
          <TouchableOpacity accessibilityRole="link" key={path} onPress={() => router.push(path as any)} className="flex-row items-center bg-card border border-border rounded-xl px-4 py-4 gap-3" activeOpacity={0.7}>
            <Text className="text-2xl">{emoji}</Text>
            <Text className="flex-1 font-medium text-foreground">{t(label)}</Text>
            <Text className="text-muted-foreground">›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

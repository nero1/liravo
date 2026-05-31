import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const ADMIN_ITEMS = [
  { emoji: '👥', label: 'Users', path: '/admin/users' },
  { emoji: '📚', label: 'Books', path: '/admin/books' },
  { emoji: '🚩', label: 'Feature Flags', path: '/admin/feature-flags' },
  { emoji: '🔗', label: 'Affiliate Stores', path: '/admin/affiliate-stores' },
  { emoji: '📣', label: 'Promoted Listings', path: '/admin/promoted-listings' },
  { emoji: '🎉', label: 'Seasonal Events', path: '/admin/seasonal-events' },
  { emoji: '✍️', label: 'Writing Challenges', path: '/admin/writing-challenges' },
  { emoji: '🎨', label: 'Theme', path: '/admin/theme' },
  { emoji: '⏱️', label: 'Cron Status', path: '/admin/cron-status' },
] as const;

export default function AdminScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {ADMIN_ITEMS.map(({ emoji, label, path }) => (
          <TouchableOpacity key={path} onPress={() => router.push(path as any)} className="flex-row items-center bg-card border border-border rounded-xl px-4 py-4 gap-3" activeOpacity={0.7}>
            <Text className="text-2xl">{emoji}</Text>
            <Text className="flex-1 font-medium text-foreground">{label}</Text>
            <Text className="text-muted-foreground">›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

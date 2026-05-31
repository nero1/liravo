import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, BookOpen } from 'lucide-react-native';
import { useShelves } from '@/hooks/useShelf';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ShelfRow } from '@/types';

const DEFAULT_ICONS: Record<string, string> = {
  currently_reading: '📖',
  want_to_read: '🔖',
  have_read: '✅',
};

export default function ShelfScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useShelves();
  const shelves = data?.shelves ?? [];

  if (isLoading) return <LoadingSpinner />;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-2xl font-bold text-foreground">My Shelf</Text>
        <TouchableOpacity
          onPress={() => router.push('/shelf/new')}
          className="p-2"
          activeOpacity={0.7}
        >
          <Plus size={22} color="#d97706" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={shelves}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <ShelfListItem shelf={item} />}
        ListEmptyComponent={
          <EmptyState
            title="No shelves yet"
            description="Your reading shelves will appear here."
            icon={<BookOpen size={48} color="#6b7280" />}
          />
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#d97706" />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}

function ShelfListItem({ shelf }: { shelf: ShelfRow }) {
  const router = useRouter();
  const icon = shelf.default_type ? DEFAULT_ICONS[shelf.default_type] ?? '📚' : '📚';

  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-4 border-b border-border gap-3"
      onPress={() => router.push(`/(tabs)/shelf/${shelf.id}`)}
      activeOpacity={0.7}
    >
      <Text className="text-2xl">{icon}</Text>
      <View className="flex-1">
        <Text className="font-semibold text-foreground">{shelf.name}</Text>
        {shelf.description && (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>{shelf.description}</Text>
        )}
      </View>
      <Text className="text-muted-foreground text-sm">›</Text>
    </TouchableOpacity>
  );
}

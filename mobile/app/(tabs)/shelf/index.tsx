import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, BookOpen } from 'lucide-react-native';
import { useShelves } from '@/hooks/useShelf';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState,QueryError } from '@/components/ui/EmptyState';
import type { ShelfRow } from '@/types';

const DEFAULT_ICONS: Record<string, string> = {
  currently_reading: '📖',
  want_to_read: '🔖',
  have_read: '✅',
};

export default function ShelfScreen() {
  const {t}=useTranslations('shelves'),{t:common}=useTranslations('common');
  const router = useRouter();
  const { data, isLoading, refetch,error,hasNextPage,fetchNextPage,isFetchingNextPage } = useShelves();
  const shelves = data?.shelves ?? [];

  if(error&&!data)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading) return <LoadingSpinner />;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-2xl font-bold text-foreground">{t('title')}</Text>
        <TouchableOpacity accessibilityRole="link"
          accessibilityLabel={t('new')} onPress={() => router.push('/shelf/new')}
          className="p-2"
          activeOpacity={0.7}
        >
          <Plus size={22} color="#d97706" />
        </TouchableOpacity>
      </View>

      <Text className="px-4 text-sm text-muted-foreground">{t('shelfCount',{count:data?.total??0})}</Text>
      <FlatList
        data={shelves}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <ShelfListItem shelf={item} />}
        ListFooterComponent={<View className="p-4 gap-3">{error&&<QueryError error={error} retry={()=>void fetchNextPage()}/>} {hasNextPage&&<TouchableOpacity accessibilityRole="button" disabled={isFetchingNextPage} onPress={()=>void fetchNextPage()}><Text className="text-accent">{common('loadMore')}</Text></TouchableOpacity>}</View>}
        ListEmptyComponent={
          <EmptyState
            title={t('empty')}
            description={t('emptyDescription')}
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

function ShelfListItem({ shelf }: { shelf: ShelfRow&{book_count?:number} }) {
  const router = useRouter(),{t:books}=useTranslations('books'),{t}=useTranslations('shelves');
  const names={currently_reading:'currentlyReading',want_to_read:'wantToRead',have_read:'haveRead'};
  const icon = shelf.default_type ? DEFAULT_ICONS[shelf.default_type] ?? '📚' : '📚';

  return (
    <TouchableOpacity accessibilityRole="link"
      className="flex-row items-center px-4 py-4 border-b border-border gap-3"
      onPress={() => router.push(`/(tabs)/shelf/${shelf.id}`)}
      activeOpacity={0.7}
    >
      <Text className="text-2xl">{icon}</Text>
      <View className="flex-1">
        <Text className="font-semibold text-foreground">{shelf.default_type?books(names[shelf.default_type]):shelf.name}</Text>
        {typeof shelf.book_count==='number'&&<Text className="text-sm text-muted-foreground">{t('bookCount',{count:shelf.book_count})}</Text>}
        {shelf.description && (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>{shelf.description}</Text>
        )}
      </View>
      <Text className="text-muted-foreground text-sm">›</Text>
    </TouchableOpacity>
  );
}

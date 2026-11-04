import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useShelf } from '@/hooks/useShelf';
import { Image } from 'expo-image';
import { ReadingProgressBar } from '@/components/shelf/ReadingProgressBar';
import { EmptyState,QueryError } from '@/components/ui/EmptyState';
import type { ShelfBookRow } from '@/types';

export default function ShelfDetailScreen() {
  const {t}=useTranslations('shelves'),{t:common}=useTranslations('common');
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter(),{t:nav}=useTranslations('nav'),{t:booksText}=useTranslations('books');

  const {data,isLoading,error,refetch,hasNextPage,fetchNextPage,isFetchingNextPage}=useShelf(id!);
  const shelf=data?.pages[0].shelf;
  const books=data?.pages.flatMap(page=>page.books)??[];
  if(error&&!data)return <QueryError error={error} retry={()=>void refetch()} />;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3">
        <Text className="text-2xl font-bold text-foreground">{shelf?.default_type?booksText({currently_reading:'currentlyReading',want_to_read:'wantToRead',have_read:'haveRead'}[shelf.default_type]):shelf?.name??nav('shelf')}</Text>
        <Text className="text-muted-foreground">{data?t('bookCount',{count:data.pages[0].total}):null}</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#d97706" size="large" />
        </View>
      ) : (
        <FlatList
          data={books}
          onEndReached={()=>{if(hasNextPage&&!isFetchingNextPage&&!error)void fetchNextPage();}}
          onEndReachedThreshold={0.4}
          ListFooterComponent={<View className="p-4 gap-3">{error&&<QueryError error={error} retry={()=>void fetchNextPage()}/>} {isFetchingNextPage?<ActivityIndicator color="#d97706"/>:hasNextPage?<TouchableOpacity accessibilityRole="button" onPress={()=>void fetchNextPage()}><Text className="text-accent">{common('loadMore')}</Text></TouchableOpacity>:null}</View>}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <ShelfBookItem
              shelfBook={item}
              onPress={() => router.push(`/book/${item.book?.id??item.book_id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState title={t('emptyShelf')} description={t('addDescription')} />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

function ShelfBookItem({
  shelfBook,
  onPress,
}: {
  shelfBook: ShelfBookRow;
  onPress: () => void;
}) {
  const {t}=useTranslations('shelves');
  const book = shelfBook.book;
  const progress = shelfBook.progress_percent ?? 0;

  return (
    <TouchableOpacity
      className="flex-row px-4 py-3 gap-3 border-b border-border"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: book?.cover_url ?? undefined }}
        style={{ width: 52, height: 78, borderRadius: 4 }}
        contentFit="cover"
        className="bg-muted"
      />
      <View className="flex-1 justify-center gap-1.5">
        <Text className="font-semibold text-foreground" numberOfLines={2}>{book?.title??t('unknownBook')}</Text>
        <Text className="text-sm text-muted-foreground">{book?.author_name}</Text>
        {progress > 0 && (
          <ReadingProgressBar
            percent={progress}
            pages={shelfBook.progress_pages ?? undefined}
            totalPages={book?.page_count ?? undefined}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

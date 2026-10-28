import {useTranslations} from '@/hooks/useTranslations';
import { useState } from 'react';
import {
  View, Text, TextInput, FlatList, ScrollView,
  TouchableOpacity, ActivityIndicator, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, X, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useBookSearch } from '@/hooks/useBooks';
import { BookCard } from '@/components/books/BookCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';

import type { BookRow } from '@/types';

const MOODS = ['Dark', 'Cozy', 'Mind-bending', 'Funny', 'Emotional', 'Inspiring', 'Romantic'];

interface SimpleBook {
  id: string;
  title: string;
  author_name: string;
  cover_url: string | null;
}

function useNewReleasesFromFollowed() {
  return useQuery({
    queryKey: ['discover', 'new-releases-followed'],
    queryFn: () => api.get<{ books: SimpleBook[] }>('/api/discover/new-releases-followed'),
    staleTime: 10 * 60 * 1000,
  });
}

function useShelfOverlapRecs() {
  return useQuery({
    queryKey: ['discover', 'shelf-overlap'],
    queryFn: () => api.get<{ books: SimpleBook[] }>('/api/discover/shelf-overlap'),
    staleTime: 30 * 60 * 1000,
  });
}

function BookCoverCard({ book, onPress }: { book: SimpleBook; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={book.title} onPress={onPress} className="w-24 mr-3">
      <View className="w-24 h-36 rounded-lg overflow-hidden bg-muted mb-1">
        {book.cover_url ? (
          <Image source={{ uri: book.cover_url }} style={{ width: 96, height: 144 }} contentFit="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-2xl">📚</Text>
          </View>
        )}
      </View>
      <Text className="text-xs font-semibold text-foreground" numberOfLines={2}>{book.title}</Text>
      <Text className="text-xs text-muted-foreground" numberOfLines={1}>{book.author_name}</Text>
    </Pressable>
  );
}

function HorizontalBookSection({ title, books, onBookPress }: {
  title: string;
  books: SimpleBook[];
  onBookPress: (id: string) => void;
}) {
  if (books.length === 0) return null;
  return (
    <View className="mb-6">
      <Text className="font-bold text-lg text-foreground px-4 mb-3">{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {books.map((book) => (
          <BookCoverCard key={book.id} book={book} onPress={() => onBookPress(book.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

export default function DiscoverScreen() {
  const {t}=useTranslations('discover'),{t:booksText}=useTranslations('books'),{t:moods}=useTranslations('moods'),{t:common}=useTranslations('common');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data, isLoading, isFetching,error,refetch } = useBookSearch(query);
  const { data: newReleasesData,error:releasesError,refetch:retryReleases } = useNewReleasesFromFollowed();
  const { data: shelfOverlapData,error:overlapError,refetch:retryOverlap } = useShelfOverlapRecs();

  const books = data?.books ?? [];
  const newReleases = (newReleasesData?.books ?? []);
  const shelfRecs = (shelfOverlapData?.books ?? []);

  function handleBookPress(id: string) {
    router.push(`/book/${id}`);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3 gap-3">
        <Text className="text-2xl font-bold text-foreground">{t('title')}</Text>

        {/* Search bar */}
        <View className="flex-row items-center bg-muted border border-border rounded-xl px-3 gap-2">
          <Search size={18} color="#6b7280" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            accessibilityLabel={booksText('searchPlaceholder')} placeholder={booksText('searchPlaceholder')}
            placeholderTextColor="#9ca3af"
            className="flex-1 py-2.5 text-foreground"
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('clearSearch')} onPress={() => setQuery('')}>
              <X size={16} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {query.length >= 2 ? (
        <FlatList
          data={books}
          keyExtractor={(b) => (b as BookRow).id}
          renderItem={({ item }) => (
            <View className="px-4 py-2">
              <BookCard book={item as BookRow} compact />
            </View>
          )}
          ListHeaderComponent={
            (isLoading || isFetching) ? (
              <View className="py-4 items-center">
                <ActivityIndicator color="#d97706" />
              </View>
            ) : error?<TouchableOpacity accessibilityRole="button" onPress={()=>void refetch()} className="p-4"><Text className="text-accent">{common('retry')}</Text></TouchableOpacity>:null
          }
          ListEmptyComponent={
            !isLoading && !isFetching ? (
              <EmptyState title={error?common('error'):booksText('noResults')} description={error?undefined:booksText('noBooksFor',{query})} />
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* New releases from followed authors */}
          <HorizontalBookSection
            title={t('newReleasesFromAuthors')}
            books={newReleases}
            onBookPress={handleBookPress}
          />

          {releasesError&&<SectionError retry={()=>void retryReleases()}/>}
          {/* Readers like you also loved */}
          <HorizontalBookSection
            title={t('readersLikeYou')}
            books={shelfRecs}
            onBookPress={handleBookPress}
          />

          {overlapError&&<SectionError retry={()=>void retryOverlap()}/>}
          {/* Browse by Mood */}
          <View className="px-4 mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="font-bold text-lg text-foreground">{t('moodTitle')}</Text>
              <TouchableOpacity
                onPress={() => router.push('/discover/mood-ai')}
                className="flex-row items-center gap-1"
              >
                <Sparkles size={14} color="#d97706" />
                <Text className="text-accent text-sm font-medium">{t('aiSearch')}</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {MOODS.map((mood) => (
                <TouchableOpacity
                  key={mood}
                  onPress={() => router.push(`/discover/mood/${mood}`)}
                  className="bg-muted border border-border rounded-full px-4 py-2"
                  activeOpacity={0.7}
                >
                  <Text className="text-foreground font-medium">{moods(mood)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionError({retry}:{retry:()=>void}){
  const {t}=useTranslations('common');
  return <View className="px-4 pb-4 gap-2"><Text accessibilityRole="alert" className="text-destructive">{t('error')}</Text><TouchableOpacity accessibilityRole="button" onPress={retry}><Text className="text-accent">{t('retry')}</Text></TouchableOpacity></View>;
}

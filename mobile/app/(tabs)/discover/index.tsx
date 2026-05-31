import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useBookSearch } from '@/hooks/useBooks';
import { BookCard } from '@/components/books/BookCard';
import { EmptyState } from '@/components/ui/EmptyState';

const MOODS = ['Dark', 'Cozy', 'Mind-bending', 'Funny', 'Emotional', 'Inspiring', 'Romantic'];

export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data, isLoading, isFetching } = useBookSearch(query);

  const books = data?.books ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3 gap-3">
        <Text className="text-2xl font-bold text-foreground">Discover</Text>

        {/* Search bar */}
        <View className="flex-row items-center bg-muted border border-border rounded-xl px-3 gap-2">
          <Search size={18} color="#6b7280" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search books, authors..."
            placeholderTextColor="#9ca3af"
            className="flex-1 py-2.5 text-foreground"
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X size={16} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {query.length >= 2 ? (
        // Search results
        <FlatList
          data={books}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <View className="px-4 py-2">
              <BookCard book={item} compact />
            </View>
          )}
          ListHeaderComponent={
            (isLoading || isFetching) ? (
              <View className="py-4 items-center">
                <ActivityIndicator color="#d97706" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !isLoading && !isFetching ? (
              <EmptyState title="No books found" description={`No results for "${query}"`} />
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      ) : (
        // Browse by mood
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <View className="px-4 mt-2">
            <Text className="font-semibold text-foreground mb-3">Browse by Mood</Text>
            <View className="flex-row flex-wrap gap-2">
              {MOODS.map((mood) => (
                <TouchableOpacity
                  key={mood}
                  onPress={() => router.push(`/discover/mood/${mood}`)}
                  className="bg-muted border border-border rounded-full px-4 py-2"
                  activeOpacity={0.7}
                >
                  <Text className="text-foreground font-medium">{mood}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

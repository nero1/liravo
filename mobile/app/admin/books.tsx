import { QueryError } from '@/components/ui/EmptyState';
import { View, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { BookCard } from '@/components/books/BookCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AdminBooksScreen() {
  const [search, setSearch] = useState('');
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['admin', 'books', search], queryFn: () => api.get<{ books: any[] }>(ENDPOINTS.admin.books, { search: search || undefined }) });
  const books = data?.books ?? [];
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-2"><TextInput value={search} onChangeText={setSearch} placeholder="Search books..." placeholderTextColor="#9ca3af" className="bg-muted rounded-xl px-3 py-2.5 text-foreground border border-border" /></View>
      {isLoading ? <LoadingSpinner /> : (
        <FlatList data={books} keyExtractor={(b) => b.id} renderItem={({ item }) => <View className="px-4 py-3 border-b border-border"><BookCard book={item} compact /></View>} contentContainerStyle={{ paddingBottom: 24 }} />
      )}
    </SafeAreaView>
  );
}

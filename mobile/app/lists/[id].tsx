import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';
import { BookCard } from '@/components/books/BookCard';

export default function ListDetailScreen() {
  const {t:ui}=useTranslations('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['list', id], queryFn: () => api.get<{ list: any; books: any[] }>(ENDPOINTS.lists.byId(id!)), enabled: !!id });
  const follow = useMutation({ mutationFn: () => api.post(ENDPOINTS.lists.follow(id!)), onSuccess: () => qc.invalidateQueries({ queryKey: ['list', id] }), onError: (err) => Alert.alert('Error', (err as Error).message) });
  const list = data?.list;
  const books = data?.books ?? [];
  if (isLoading || !list) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-3 border-b border-border gap-1">
        <Text className="text-xl font-bold text-foreground">{list.title}</Text>
        <Text className="text-sm text-muted-foreground">{list.book_count} books · {list.follower_count}{ui('profile.followers')}</Text>
        {list.description && <Text className="text-muted-foreground text-sm">{list.description}</Text>}
        <Button onPress={() => follow.mutate()} loading={follow.isPending} variant="outline" size="sm" style={{ marginTop: 8, alignSelf: 'flex-start' }}>Follow List</Button>
      </View>
      <FlatList data={books} keyExtractor={(b) => b.id} renderItem={({ item }) => <View className="px-4 py-3 border-b border-border"><BookCard book={item} compact /></View>} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

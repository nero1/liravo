import { QueryError } from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ResourcesScreen() {
  const {t:ui}=useTranslations('');
  const router = useRouter();
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['write', 'resources'], queryFn: () => api.get<{ books: any[] }>('/api/books/search?q=writing+craft&limit=20') });
  const books = data?.books ?? [];
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-3"><Text className="text-sm text-muted-foreground">{ui('nativeWriting.resourcesDescription')}</Text></View>
      <FlatList data={books} keyExtractor={(b) => b.id} renderItem={({ item }) => (
        <TouchableOpacity accessibilityRole="button" className="px-4 py-3 border-b border-border" onPress={() => router.push(`/book/${item.id}`)} activeOpacity={0.7}>
          <Text className="font-semibold text-foreground">{item.title}</Text>
          <Text className="text-sm text-muted-foreground">{item.author_name}</Text>
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title={ui('nativeWriting.noResources')}/>} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

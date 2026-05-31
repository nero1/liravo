import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';

export default function WrappedScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['wrapped'], queryFn: () => api.get<{ wrapped: any }>(ENDPOINTS.wrapped) });
  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  const wrapped = data?.wrapped;
  if (!wrapped) return <View className="flex-1 items-center justify-center bg-background px-4"><Text className="text-muted-foreground text-center">Your year in books is not available yet. Check back at year end!</Text></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Text className="text-2xl font-bold text-foreground text-center">Your {new Date().getFullYear() - 1} in Books</Text>
        <Card><Text className="text-4xl font-bold text-foreground text-center">{wrapped.books_read ?? 0}</Text><Text className="text-center text-muted-foreground">Books Read</Text></Card>
        <Card><Text className="text-4xl font-bold text-foreground text-center">{(wrapped.pages_read ?? 0).toLocaleString()}</Text><Text className="text-center text-muted-foreground">Pages Turned</Text></Card>
        {wrapped.top_genre && <Card><Text className="font-semibold text-foreground mb-1">Favorite Genre</Text><Text className="text-2xl font-bold text-accent">{wrapped.top_genre}</Text></Card>}
        {wrapped.top_author && <Card><Text className="font-semibold text-foreground mb-1">Most Read Author</Text><Text className="text-2xl font-bold text-foreground">{wrapped.top_author}</Text></Card>}
      </ScrollView>
    </SafeAreaView>
  );
}

import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';

export default function CreatorLeaderboardScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['creator', 'leaderboard'], queryFn: () => api.get<{ leaderboard: any[] }>(ENDPOINTS.creator.leaderboard) });
  const entries = data?.leaderboard ?? [];
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      {isLoading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color="#d97706" /></View> : (
        <FlatList data={entries} keyExtractor={(e) => e.user_id} renderItem={({ item, index }) => (
          <View className="flex-row items-center px-4 py-3 border-b border-border gap-3">
            <Text className={`w-8 text-center font-bold ${index < 3 ? 'text-accent' : 'text-muted-foreground'}`}>{index + 1}</Text>
            <Avatar uri={item.user?.avatar_url} name={item.user?.display_name} size={40} />
            <View className="flex-1"><Text className="font-semibold text-foreground">{item.user?.display_name}</Text><Text className="text-xs text-muted-foreground">@{item.user?.username}</Text></View>
            <Text className="font-bold text-accent">${(item.earnings ?? 0).toFixed(2)}</Text>
          </View>
        )} ListEmptyComponent={<EmptyState title="No creators yet" />} contentContainerStyle={{ paddingBottom: 24 }} />
      )}
    </SafeAreaView>
  );
}

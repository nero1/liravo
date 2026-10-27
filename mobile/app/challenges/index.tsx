import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ChallengeRow } from '@/types';

export default function ChallengesScreen() {
  const router = useRouter();
  const { data, isLoading,error,refetch } = useQuery({
    queryKey: ['challenges'],
    queryFn: () => api.get<{ challenges: ChallengeRow[] }>(ENDPOINTS.challenges.list),
  });
  const challenges = data?.challenges ?? [];

  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#d97706" /></View>
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="px-4 py-4 border-b border-border gap-1"
              onPress={() => router.push(`/challenges/${item.id}`)}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold text-foreground flex-1">{item.title}</Text>

              </View>
              {item.description && <Text className="text-sm text-muted-foreground" numberOfLines={2}>{item.description}</Text>}
              <Text className="text-xs text-accent">{item.goal_books??0} books · {item.goal_pages??0} pages</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState title="No challenges yet" />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

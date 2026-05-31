import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ChallengeRow } from '@/types';

export default function ChallengesScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['challenges'],
    queryFn: () => api.get<{ challenges: ChallengeRow[] }>(ENDPOINTS.challenges.list),
  });
  const challenges = data?.challenges ?? [];

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
                {item.is_premium && <Badge variant="accent">Premium</Badge>}
              </View>
              {item.description && <Text className="text-sm text-muted-foreground" numberOfLines={2}>{item.description}</Text>}
              <Text className="text-xs text-accent">{item.xp_reward} XP · {item.participant_count} participants</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState title="No challenges yet" />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

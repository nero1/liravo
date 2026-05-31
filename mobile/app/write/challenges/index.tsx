import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { WritingChallengeRow } from '@/types';

export default function WritingChallengesScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['write', 'challenges'], queryFn: () => api.get<{ challenges: WritingChallengeRow[] }>(ENDPOINTS.write.challenges) });
  const challenges = data?.challenges ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={challenges} keyExtractor={(c) => c.id} renderItem={({ item }) => (
        <TouchableOpacity className="px-4 py-4 border-b border-border gap-1" onPress={() => router.push(`/write/challenges/${item.id}`)} activeOpacity={0.7}>
          <View className="flex-row items-center gap-2"><Text className="font-semibold text-foreground flex-1">{item.title}</Text>{item.is_premium && <Badge variant="accent">Premium</Badge>}</View>
          {item.description && <Text className="text-sm text-muted-foreground" numberOfLines={2}>{item.description}</Text>}
          <Text className="text-xs text-accent">{item.xp_reward} XP{item.word_limit ? ` · ${item.word_limit} word limit` : ''}</Text>
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title="No writing challenges" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

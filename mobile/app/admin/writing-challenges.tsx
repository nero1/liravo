import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AdminWritingChallengesScreen() {
  const {t:ui}=useTranslations('');
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'writing-challenges'], queryFn: () => api.get<{ challenges: any[] }>(ENDPOINTS.write.challenges) });
  const challenges = data?.challenges ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={challenges} keyExtractor={(c) => c.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border gap-1">
          <View className="flex-row items-center gap-2"><Text className="font-semibold text-foreground flex-1">{item.title}</Text>{item.is_premium && <Badge variant="accent">{ui('premium.premium')}</Badge>}</View>
          <Text className="text-xs text-muted-foreground">{item.participant_count} participants · {item.xp_reward} XP</Text>
        </View>
      )} ListEmptyComponent={<EmptyState title="No writing challenges" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

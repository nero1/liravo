import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  xp: number;
  level_title: string;
  helpful_votes?: number;
  review_count?: number;
}

type LBType = 'global' | 'national' | 'friends' | 'reviewers';
type LBPeriod = 'weekly' | 'monthly' | 'alltime';

const TYPE_LABELS: Record<LBType, string> = {
  global: 'Global',
  national: 'National',
  friends: 'Friends',
  reviewers: 'Top Reviewers',
};

const PERIOD_LABELS: Record<LBPeriod, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  alltime: 'All Time',
};

export default function LeaderboardScreen() {
  const [type, setType] = useState<LBType>('global');
  const [period, setPeriod] = useState<LBPeriod>('weekly');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', type, period],
    queryFn: () => api.get<{ leaderboard: LeaderboardEntry[] }>(`/api/leaderboards?type=${type}&period=${period}`),
  });

  const entries = data?.leaderboard ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-foreground mb-3">Leaderboard</Text>

        {/* Type selector */}
        <View className="flex-row gap-1.5 flex-wrap">
          {(Object.keys(TYPE_LABELS) as LBType[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setType(t)}
              className={`px-3 py-1.5 rounded-full ${type === t ? 'bg-accent' : 'bg-muted'}`}
            >
              <Text className={`text-xs font-medium ${type === t ? 'text-white' : 'text-muted-foreground'}`}>
                {TYPE_LABELS[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Period selector — hidden for reviewers */}
        {type !== 'reviewers' && (
          <View className="flex-row gap-1.5 mt-2">
            {(Object.keys(PERIOD_LABELS) as LBPeriod[]).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                className={`px-3 py-1 rounded-full border ${period === p ? 'border-accent bg-accent/10' : 'border-border'}`}
              >
                <Text className={`text-xs ${period === p ? 'text-accent font-medium' : 'text-muted-foreground'}`}>
                  {PERIOD_LABELS[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#d97706" size="large" />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item: entry }) => (
            <View className="flex-row items-center px-4 py-3 border-b border-border gap-3">
              <View className={`w-8 h-8 rounded-full items-center justify-center flex-shrink-0 ${
                entry.rank === 1 ? 'bg-yellow-400' : entry.rank === 2 ? 'bg-gray-300' : entry.rank === 3 ? 'bg-amber-600' : 'bg-muted'
              }`}>
                <Text className={`font-bold text-sm ${entry.rank <= 3 ? 'text-white' : 'text-muted-foreground'}`}>
                  {entry.rank <= 3 ? (entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉') : entry.rank}
                </Text>
              </View>
              <Avatar uri={entry.avatar_url} name={entry.display_name} size={40} />
              <View className="flex-1">
                <Text className="font-semibold text-foreground text-sm">{entry.display_name}</Text>
                <Text className="text-xs text-muted-foreground">{entry.level_title}</Text>
              </View>
              <View className="items-end">
                {type === 'reviewers' ? (
                  <>
                    <Text className="font-bold text-accent text-sm">{(entry.helpful_votes ?? 0).toLocaleString()}</Text>
                    <Text className="text-xs text-muted-foreground">{entry.review_count ?? 0} reviews</Text>
                  </>
                ) : (
                  <>
                    <Text className="font-bold text-accent text-sm">{entry.xp.toLocaleString()}</Text>
                    <Text className="text-xs text-muted-foreground">XP</Text>
                  </>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="py-16 items-center">
              <Text className="text-muted-foreground">No rankings yet. Start {type === 'reviewers' ? 'reviewing' : 'reading'}!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

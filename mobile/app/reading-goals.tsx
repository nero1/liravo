import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

interface GoalData {
  actorId:string;goal: { id: string; user_id:string; year: number; target_books: number } | null;
  progress: { books_read: number; year: number; percentage: number | null };
}

const PRESETS = [6, 12, 24, 36, 52, 100];

const MILESTONES = [
  { pct: 25, emoji: '🌱' },
  { pct: 50, emoji: '🌿' },
  { pct: 75, emoji: '🌳' },
  { pct: 100, emoji: '🏆' },
];

export default function ReadingGoalsScreen() {
  const {t}=useTranslations('readingStatistics'),{t:goalText}=useTranslations('readingGoalForm'),{t:common}=useTranslations('common'),owner=useAuthStore(state=>state.user?.id);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [targetInput, setTargetInput] = useState('52');

  const { data, isLoading,error,refetch } = useQuery({
    queryKey: ['reading-goals',owner],enabled:!!owner,
    queryFn: async()=>{const data=await api.get<GoalData>('/api/reading-goals');if(data.actorId!==owner||!data.progress)throw Error('Invalid goal snapshot');return data;},
  });

  const setGoalMutation = useMutation({
    mutationFn: async(target:number)=>{const data=await api.post<{actorId:string;goal:NonNullable<GoalData['goal']>}>('/api/reading-goals',{target_books:target},{'X-Liravo-Actor':owner!});if(data.actorId!==owner||data.goal?.user_id!==owner||data.goal.target_books!==target)throw Error('Invalid goal receipt');return data;},
    onSuccess: () => {
      if(useAuthStore.getState().user?.id!==owner)return;
      qc.invalidateQueries({ queryKey: ['reading-goals'] });
      setEditing(false);
    },
    onError:()=>Alert.alert(common('error'),goalText('failed')),
  });

  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading) {
    return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  }

  const { goal, progress } = data ?? { goal: null, progress: { books_read: 0, year: new Date().getUTCFullYear(), percentage: null } };
  const pct = progress.percentage ?? 0,target=Number(targetInput),valid=Number.isInteger(target)&&target>=1&&target<=10000;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View>
          <Text className="text-2xl font-bold text-foreground">{t('goalTitle',{year:progress.year})}</Text>
          <Text className="text-muted-foreground text-sm mt-1">{t('goalDescription')}</Text>
        </View>

        {goal && !editing ? (
          <View className="rounded-xl border border-border bg-card p-6 gap-5">
            {/* Progress display */}
            <View className="items-center gap-2">
              <Text className="text-5xl font-bold text-accent">{pct}%</Text>
              <Text className="text-muted-foreground text-sm">{t('goalProgress',{count:progress.books_read,target:goal.target_books})}</Text>
            </View>

            {/* Progress bar */}
            <View className="h-4 rounded-full bg-muted overflow-hidden">
              <View className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
            </View>

            {/* Milestones */}
            <View className="flex-row gap-2">
              {MILESTONES.map((m) => {
                const reached = pct >= m.pct;
                return (
                  <View key={m.pct} className={`flex-1 rounded-lg p-2 items-center ${reached ? 'bg-accent/10 border border-accent/30' : 'bg-muted border border-border'}`}>
                    <Text className={`text-2xl ${reached ? '' : 'opacity-30'}`}>{m.emoji}</Text>
                    <Text className={`text-xs font-medium ${reached ? 'text-accent' : 'text-muted-foreground'}`}>{m.pct}%</Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity accessibilityRole="button" onPress={()=>{setTargetInput(String(goal.target_books));setEditing(true);}} className="border border-border rounded-xl py-3 items-center">
              <Text className="text-sm text-foreground font-medium">{t('changeGoal')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="rounded-xl border border-border bg-card p-5 gap-4">
            <Text className="font-semibold text-foreground">{t(goal?'updateGoal':'setGoal')}</Text>

            <View className="flex-row flex-wrap gap-2">
              {PRESETS.map((n) => (
                <TouchableOpacity
                  key={n}
                  disabled={setGoalMutation.isPending} accessibilityRole="button" accessibilityState={{selected:targetInput===String(n),disabled:setGoalMutation.isPending}} onPress={() => setTargetInput(String(n))}
                  className={`px-3 py-1.5 rounded-full border ${targetInput === String(n) ? 'bg-accent/10 border-accent' : 'border-border bg-muted'}`}
                >
                  <Text className={`text-sm ${targetInput === String(n) ? 'text-accent font-medium' : 'text-muted-foreground'}`}>
                    {t('goalPreset',{count:n})}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              value={targetInput}
              onChangeText={setTargetInput}
              keyboardType="numeric"
              accessibilityLabel={t('customGoal')} placeholder={t('customGoal')} maxLength={5} editable={!setGoalMutation.isPending}
              placeholderTextColor="#9ca3af"
              className="border border-border rounded-xl px-4 py-3 text-sm text-foreground bg-background"
            />

            <View className="flex-row gap-2">
              {goal && (
                <TouchableOpacity accessibilityRole="button" disabled={setGoalMutation.isPending} onPress={() => setEditing(false)} className="flex-1 border border-border rounded-xl py-3 items-center">
                  <Text className="text-sm text-muted-foreground">{common('cancel')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => { if(valid)setGoalMutation.mutate(target); }}
                disabled={setGoalMutation.isPending||!valid} accessibilityRole="button" accessibilityState={{disabled:setGoalMutation.isPending||!valid,busy:setGoalMutation.isPending}}
                className="flex-1 bg-accent rounded-xl py-3 items-center disabled:opacity-50"
              >
                <Text className="text-white text-sm font-semibold">
                  {setGoalMutation.isPending?common('saving'):t(goal?'updateGoal':'setGoal')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Encouragement */}
        {goal && (
          <View className="rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 p-4">
            <Text className="text-sm text-amber-800 dark:text-amber-200">
              {pct>=100?t('goalComplete'):pct>=75?t('goalAlmost'):pct>=50?t('goalHalf'):pct>=25?t('goalStart'):t('goalRemaining',{count:Math.max(0,goal.target_books-progress.books_read)})}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

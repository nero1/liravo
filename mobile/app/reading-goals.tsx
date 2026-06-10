import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

interface GoalData {
  goal: { id: string; year: number; target_books: number } | null;
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
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [targetInput, setTargetInput] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reading-goals'],
    queryFn: () => api.get<GoalData>('/api/reading-goals'),
    onSuccess: (d: GoalData) => {
      if (d.goal) setTargetInput(String(d.goal.target_books));
    },
  });

  const setGoalMutation = useMutation({
    mutationFn: (target: number) => api.post('/api/reading-goals', { target_books: target }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reading-goals'] });
      setEditing(false);
    },
  });

  if (isLoading) {
    return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  }

  const { goal, progress } = data ?? { goal: null, progress: { books_read: 0, year: new Date().getFullYear(), percentage: null } };
  const pct = progress.percentage ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View>
          <Text className="text-2xl font-bold text-foreground">Reading Goal {progress.year}</Text>
          <Text className="text-muted-foreground text-sm mt-1">Track your annual reading target.</Text>
        </View>

        {goal && !editing ? (
          <View className="rounded-xl border border-border bg-card p-6 gap-5">
            {/* Progress display */}
            <View className="items-center gap-2">
              <Text className="text-5xl font-bold text-accent">{pct}%</Text>
              <Text className="text-muted-foreground text-sm">{progress.books_read} of {goal.target_books} books read</Text>
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

            <TouchableOpacity onPress={() => setEditing(true)} className="border border-border rounded-xl py-3 items-center">
              <Text className="text-sm text-foreground font-medium">Change Goal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="rounded-xl border border-border bg-card p-5 gap-4">
            <Text className="font-semibold text-foreground">{goal ? 'Update Your Goal' : 'Set a Reading Goal'}</Text>

            <View className="flex-row flex-wrap gap-2">
              {PRESETS.map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setTargetInput(String(n))}
                  className={`px-3 py-1.5 rounded-full border ${targetInput === String(n) ? 'bg-accent/10 border-accent' : 'border-border bg-muted'}`}
                >
                  <Text className={`text-sm ${targetInput === String(n) ? 'text-accent font-medium' : 'text-muted-foreground'}`}>
                    {n} books
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              value={targetInput}
              onChangeText={setTargetInput}
              keyboardType="numeric"
              placeholder="Custom number…"
              placeholderTextColor="#9ca3af"
              className="border border-border rounded-xl px-4 py-3 text-sm text-foreground bg-background"
            />

            <View className="flex-row gap-2">
              {goal && (
                <TouchableOpacity onPress={() => setEditing(false)} className="flex-1 border border-border rounded-xl py-3 items-center">
                  <Text className="text-sm text-muted-foreground">Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => { const t = parseInt(targetInput, 10); if (t > 0) setGoalMutation.mutate(t); }}
                disabled={setGoalMutation.isPending || !targetInput || parseInt(targetInput) < 1}
                className="flex-1 bg-accent rounded-xl py-3 items-center disabled:opacity-50"
              >
                <Text className="text-white text-sm font-semibold">
                  {setGoalMutation.isPending ? 'Saving…' : goal ? 'Update Goal' : 'Set Goal'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Encouragement */}
        {goal && (
          <View className="rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 p-4">
            <Text className="text-sm text-amber-800 dark:text-amber-200">
              {pct >= 100 ? '🎉 You\'ve hit your goal! You\'re a reading champion!'
                : pct >= 75 ? '📚 Almost there! Keep up the great reading!'
                : pct >= 50 ? '🌿 Halfway there! Keep the momentum going!'
                : pct >= 25 ? '🌱 Great start! You\'re building momentum.'
                : `📖 You need ${goal.target_books - progress.books_read} more books. You can do it!`}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

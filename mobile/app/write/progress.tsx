interface ProgressData {
  total_words: number;
  prompts_completed: number;
  challenges_completed: number;
  workshop_critiques: number;
  writing_streak: number;
  xp: number;
}

export default function WritingProgressScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['write', 'progress'],
    queryFn: () => api.get<ProgressData>(ENDPOINTS.write.progress),
  });

  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;

  const p = data;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
        {p ? (
          <View className="gap-4">
            {(p.writing_streak ?? 0) > 0 && (
              <View className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex-row items-center gap-3">
                <Text className="text-4xl">🔥</Text>
                <View>
                  <Text className="text-2xl font-bold text-amber-700 dark:text-amber-400">{p.writing_streak}-day writing streak!</Text>
                  <Text className="text-sm text-amber-600 dark:text-amber-500">Keep writing every day</Text>
                </View>
              </View>
            )}
            <Card><Text className="font-semibold text-foreground mb-2">Words Written</Text><Text className="text-3xl font-bold text-foreground">{(p.total_words ?? 0).toLocaleString()}</Text></Card>
            <View className="flex-row gap-3">
              <View className="flex-1"><Card><Text className="font-semibold text-foreground mb-1 text-sm">Prompts</Text><Text className="text-2xl font-bold text-foreground">{p.prompts_completed ?? 0}</Text></Card></View>
              <View className="flex-1"><Card><Text className="font-semibold text-foreground mb-1 text-sm">Challenges</Text><Text className="text-2xl font-bold text-foreground">{p.challenges_completed ?? 0}</Text></Card></View>
              <View className="flex-1"><Card><Text className="font-semibold text-foreground mb-1 text-sm">Workshops</Text><Text className="text-2xl font-bold text-foreground">{p.workshop_critiques ?? 0}</Text></Card></View>
            </View>
            <Card><Text className="font-semibold text-foreground mb-2">XP from Writing</Text><Text className="text-3xl font-bold text-accent">{(p.xp ?? 0).toLocaleString()} XP</Text></Card>
          </View>
        ) : (
          <Text className="text-muted-foreground text-center mt-8">No writing progress yet. Start with a prompt!</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

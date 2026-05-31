import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';

export default function WritingProgressScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['write', 'progress'], queryFn: () => api.get<{ progress: any }>(ENDPOINTS.write.progress) });
  const progress = data?.progress;
  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        {progress ? (
          <>
            <Card><Text className="font-semibold text-foreground mb-2">Words Written</Text><Text className="text-3xl font-bold text-foreground">{(progress.total_words ?? 0).toLocaleString()}</Text></Card>
            <Card><Text className="font-semibold text-foreground mb-2">Submissions</Text><Text className="text-3xl font-bold text-foreground">{progress.submission_count ?? 0}</Text></Card>
            <Card><Text className="font-semibold text-foreground mb-2">Challenges Completed</Text><Text className="text-3xl font-bold text-foreground">{progress.challenges_completed ?? 0}</Text></Card>
          </>
        ) : (
          <Text className="text-muted-foreground text-center">No writing progress yet. Start with a prompt!</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

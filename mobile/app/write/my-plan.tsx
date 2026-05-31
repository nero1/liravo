import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';

export default function MyPlanScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['write', 'my-plan'], queryFn: () => api.get<{ plan: any }>('/api/write/progress') });
  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  const plan = data?.plan;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        {plan?.ai_plan ? (
          <Card><Text className="font-semibold text-foreground mb-2">Your AI Writing Plan</Text><Text className="text-foreground leading-relaxed">{plan.ai_plan}</Text></Card>
        ) : (
          <Card><Text className="text-muted-foreground">No writing plan yet. Complete some prompts and challenges to unlock your personalized AI writing plan.</Text></Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

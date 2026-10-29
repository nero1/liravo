import {useTranslations} from '@/hooks/useTranslations';
import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';

interface ProgressData {
  total_words: number;
  prompts_completed: number;
  challenges_completed: number;
  workshop_critiques: number;
  writing_streak: number;
  xp: number;
}

export default function WritingProgressScreen() {
  const {t:ui,locale}=useTranslations('');
  const { data, isLoading,error,refetch } = useQuery({
    queryKey: ['write', 'progress'],
    queryFn: () => api.get<ProgressData>(ENDPOINTS.write.progress),
  });

  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator accessibilityLabel={ui('common.loading')} color="#d97706" /></View>;

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
                  <Text className="text-2xl font-bold text-amber-700 dark:text-amber-400">{ui('nativeWriting.streak',{count:p.writing_streak})}</Text>
                  <Text className="text-sm text-amber-600 dark:text-amber-500">{ui('nativeWriting.keepWriting')}</Text>
                </View>
              </View>
            )}
            <Card><Text className="font-semibold text-foreground mb-2">{ui('nativeWriting.wordsWritten')}</Text><Text className="text-3xl font-bold text-foreground">{(p.total_words ?? 0).toLocaleString(locale)}</Text></Card>
            <View className="flex-row gap-3">
              <View className="flex-1"><Card><Text className="font-semibold text-foreground mb-1 text-sm">{ui('nativeWriting.prompts')}</Text><Text className="text-2xl font-bold text-foreground">{(p.prompts_completed??0).toLocaleString(locale)}</Text></Card></View>
              <View className="flex-1"><Card><Text className="font-semibold text-foreground mb-1 text-sm">{ui('nativeNavigation.challenges')}</Text><Text className="text-2xl font-bold text-foreground">{(p.challenges_completed??0).toLocaleString(locale)}</Text></Card></View>
              <View className="flex-1"><Card><Text className="font-semibold text-foreground mb-1 text-sm">{ui('nativeWriting.critiques')}</Text><Text className="text-2xl font-bold text-foreground">{(p.workshop_critiques??0).toLocaleString(locale)}</Text></Card></View>
            </View>
            <Card><Text className="font-semibold text-foreground mb-2">{ui('nativeWriting.totalXp')}</Text><Text className="text-3xl font-bold text-accent">{ui('writing.xpCount',{count:p.xp??0})}</Text></Card>
          </View>
        ) : (
          <Text className="text-muted-foreground text-center mt-8">{ui('nativeWriting.noProgress')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

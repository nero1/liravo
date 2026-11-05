import { QueryError } from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
import { Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { WritingPromptRow } from '@/types';

export default function PromptsScreen() {
  const {t:ui}=useTranslations('');
  const router = useRouter();
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['write', 'prompts'], queryFn: () => api.get<{ prompts: WritingPromptRow[] }>(ENDPOINTS.write.prompts) });
  const prompts = data?.prompts ?? [];
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={prompts} keyExtractor={(p) => p.id} renderItem={({ item }) => (
        <TouchableOpacity accessibilityRole="button" className="px-4 py-4 border-b border-border gap-1" onPress={() => router.push(`/write/prompts/${item.id}`)} activeOpacity={0.7}>
          <Text className="text-foreground">{item.prompt}</Text>
          {item.genre && <Text className="text-xs text-muted-foreground">{item.genre}</Text>}
          {item.submission_count !== undefined && <Text className="text-xs text-accent">{ui('writing.submissionCount',{count:item.submission_count})}</Text>}
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title={ui('nativeWriting.noPrompts')}/>} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

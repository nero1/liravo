import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import { QueryError } from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AskScreen() {
  const {t:ui}=useTranslations('');
  const qc=useQueryClient(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner);
  const [question, setQuestion] = useState('');
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['write', 'questions'], queryFn: () => api.get<{ questions: any[] }>(ENDPOINTS.write.questions) });
  const submit = useMutation({ mutationFn:async()=>{const body={question:question.trim(),tags:[]},scope='writing.question',result=await api.post<{question:{id:string;user_id:string}}>(ENDPOINTS.write.questions,body,await intent.durableHeaders(body,scope));if(!result.question?.id||result.question.user_id!==owner)throw Error('Invalid question receipt');await intent.complete(scope);}, onSuccess:()=>{if(useAuthStore.getState().user?.id!==owner)return;qc.invalidateQueries({ queryKey: ['write', 'questions'] }); setQuestion(''); Alert.alert(ui('nativeWriting.questionPosted')); }, onError:()=>Alert.alert(ui('common.error'),ui('writing.submitFailure')) });
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-3 gap-2 border-b border-border">
        <TextInput editable={!submit.isPending} value={question} onChangeText={setQuestion} placeholder={ui('nativeWriting.questionPlaceholder')} accessibilityLabel={ui('nativeWriting.askTitle')} placeholderTextColor="#9ca3af" className="bg-muted rounded-xl px-3 py-2.5 text-foreground" multiline maxLength={280} />
        <Button onPress={() => submit.mutate()} loading={submit.isPending} disabled={question.trim().length<10} size="sm">{ui('nativeWriting.postQuestion')}</Button>
      </View>
      <FlatList data={data?.questions ?? []} keyExtractor={(q) => q.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border gap-2">
          <Text className="font-medium text-foreground">{item.question}</Text>
          <Text className="text-xs text-muted-foreground">{ui('nativeWriting.answers',{count:item.answer_count??0})}</Text>
        </View>
      )} ListEmptyComponent={<EmptyState title={ui('nativeWriting.noQuestions')} description={ui('nativeWriting.firstQuestion')}/>} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

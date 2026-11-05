import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import { QueryError } from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { WritingPromptRow } from '@/types';

export default function PromptDetailScreen() {
  const {t:ui}=useTranslations('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc=useQueryClient(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner);
  const [response, setResponse] = useState('');
  const { data, isLoading,error,refetch } = useQuery({ queryKey:['write','prompt',owner,id], queryFn:async({signal})=>{const data=await api.get<{actorId:string;prompt:WritingPromptRow;submission:{id:string;content:string}|null}>(ENDPOINTS.write.promptById(id!),undefined,signal);if(data.actorId!==owner||!data.prompt?.id)throw Error('Invalid prompt response');return data;},enabled:!!id&&!!owner });
  const submit = useMutation({
    mutationFn:async()=>{const body={content:response},scope='writing.prompt.'+id,result=await api.post<{submission:{id:string;user_id:string;content:string}}>(ENDPOINTS.write.submitPrompt(id!),body,await intent.durableHeaders(body,scope));if(!result.submission?.id||result.submission.user_id!==owner||typeof result.submission.content!=='string')throw Error('Invalid prompt receipt');await intent.complete(scope);return result.submission;},
    onSuccess:submission=>{if(useAuthStore.getState().user?.id!==owner)return;qc.setQueryData(['write','prompt',owner,id],(previous:typeof data)=>previous?{...previous,submission}:previous);void qc.invalidateQueries({queryKey:['write']});Alert.alert(ui('writing.responseSubmitted'));setResponse('');},
    onError:()=>Alert.alert(ui('common.error'),ui('writing.submitFailure')),
  });
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if (isLoading || !data) return <LoadingSpinner />;
  const prompt = data.prompt;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
          <View className="bg-accent/10 border border-accent/30 rounded-xl p-4">
            <Text className="text-foreground font-medium">{prompt.prompt}</Text>
          </View>
          {data.submission?<View className="gap-3"><Text className="text-muted-foreground">{ui('writing.alreadySubmitted')}</Text><Text className="text-foreground">{data.submission.content}</Text></View>:<>
          <Input editable={!submit.isPending} label={ui('writing.responseLabel')} value={response} onChangeText={setResponse} placeholder={ui('writing.responsePlaceholder')} multiline numberOfLines={8} maxLength={2000} style={{ minHeight: 160, textAlignVertical: 'top' }} />
          <Button onPress={() => submit.mutate()} loading={submit.isPending} disabled={response.trim().length < 50} size="lg">{ui('writing.submitResponse')}</Button>
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

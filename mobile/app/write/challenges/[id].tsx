import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import { QueryError } from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState,useEffect,useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function WritingChallengeDetailScreen() {
  const {t:ui,locale}=useTranslations('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc=useQueryClient(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner);
  const [title, setTitle] = useState('');
  const [submission, setSubmission] = useState('');
  const { data, isLoading,error,refetch } = useQuery({ queryKey:['write','challenge',owner,id], queryFn:async({signal})=>{const data=await api.get<{actorId:string;challenge:import('@/types').WritingChallengeRow;joined:boolean;entry:{id:string;title:string;content:string}|null}>(ENDPOINTS.write.challengeById(id!),undefined,signal);if(data.actorId!==owner||!data.challenge?.id)throw Error('Invalid challenge response');return data;},enabled:!!id&&!!owner });
  const join = useMutation({ mutationFn:async()=>{const body={},scope='writing.join.'+id,result=await api.post<{success:boolean}>(ENDPOINTS.write.joinChallenge(id!),body,await intent.durableHeaders(body,scope));if(result.success!==true)throw Error('Invalid challenge receipt');await intent.complete(scope);}, onSuccess:()=>{if(useAuthStore.getState().user?.id!==owner)return;qc.invalidateQueries({queryKey:['write']}); Alert.alert(ui('writingChallenge.joined')); }, onError:()=>Alert.alert(ui('common.error'),ui('writing.submitFailure')) });
  const submit = useMutation({ mutationFn:async()=>{const body={title:title.trim(),body:submission.trim()},scope='writing.challenge.'+id,result=await api.post<{entry:{id:string;user_id:string;title:string;content:string}}>(ENDPOINTS.write.submitChallenge(id!),body,await intent.durableHeaders(body,scope));if(!result.entry?.id||result.entry.user_id!==owner||typeof result.entry.title!=='string'||typeof result.entry.content!=='string')throw Error('Invalid entry receipt');await intent.complete(scope);return result.entry;}, onSuccess:entry=>{if(useAuthStore.getState().user?.id!==owner)return;qc.setQueryData(['write','challenge',owner,id],(previous:typeof data)=>previous?{...previous,entry,joined:true}:previous);void qc.invalidateQueries({queryKey:['write']});Alert.alert(ui('writing.entrySaved')); }, onError:()=>Alert.alert(ui('common.error'),ui('writing.submitFailure')) });
  const challenge = data?.challenge;
  const loaded=useRef<string|null>(null);
  useEffect(()=>{if(!data)return;const key=owner+':'+id;if(loaded.current===key)return;loaded.current=key;setTitle(data.entry?.title??'');setSubmission(data.entry?.content??'');},[data,owner,id]);
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if (isLoading || !challenge) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator accessibilityLabel={ui('common.loading')} color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
          <Text className="text-2xl font-bold text-foreground">{challenge.title}</Text>
          {challenge.description && <Text className="text-foreground">{challenge.description}</Text>}
          <View className="flex-row gap-4 flex-wrap"><Text className="text-sm text-muted-foreground">🏆 {ui('writing.xpCount',{count:challenge.xp_reward})}</Text>{challenge.goal_value&&<Text className="text-sm text-muted-foreground">{ui(challenge.goal_type==='word_count'?'writing.goalWords':'writing.goalSubmissions',{count:challenge.goal_value})}</Text>}{challenge.deadline && <Text className="text-sm text-muted-foreground">{ui('nativeWriting.due',{date:new Date(challenge.deadline).toLocaleDateString(locale,{timeZone:'UTC'})})}</Text>}</View>
          <Button onPress={()=>join.mutate()} loading={join.isPending} disabled={data?.joined===true} variant="outline">{ui(data?.joined?'writingChallenge.joined':'writingChallenge.join')}</Button>
          <Input editable={!submit.isPending} label={ui('writing.entryTitle')} value={title} onChangeText={setTitle} maxLength={200} />
          <Input editable={!submit.isPending} label={ui('writing.entryBody')} value={submission} onChangeText={setSubmission} placeholder={ui('writing.entryBodyPlaceholder')} multiline numberOfLines={10} maxLength={50000} style={{ minHeight: 200, textAlignVertical: 'top' }} />
          <Button onPress={() => submit.mutate()} loading={submit.isPending} disabled={!title.trim() || !submission.trim()} size="lg">{ui('writing.submitEntry')}</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

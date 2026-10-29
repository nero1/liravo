import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {QueryError,EmptyState} from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
import {View,Text,FlatList,Alert,TextInput,TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useState} from 'react';
import {useRouter} from 'expo-router';
import {useInfiniteQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {Button} from '@/components/ui/Button';
import {LoadingSpinner} from '@/components/ui/LoadingSpinner';
import type {WriterQuestion,QuestionFilter} from '@/types';
interface Page {actorId:string;questions:WriterQuestion[];nextCursor:string|null;}
export default function AskScreen(){
  const {t,locale}=useTranslations('writerQuestions'),{t:common}=useTranslations('common'),qc=useQueryClient(),router=useRouter(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),[question,setQuestion]=useState(''),[filter,setFilter]=useState<QuestionFilter>('all');
  const query=useInfiniteQuery({queryKey:['write','questions',owner,filter],enabled:!!owner,initialPageParam:null as string|null,queryFn:async({pageParam,signal})=>{const page=await api.get<Page>(ENDPOINTS.write.questions,{filter,...(pageParam?{cursor:pageParam}:{})},signal);if(page.actorId!==owner)throw Error('Account changed');return page;},getNextPageParam:page=>page.nextCursor});
  const submit=useMutation({mutationFn:async()=>{const body={question:question.trim(),tags:[]},scope='writing.question',result=await api.post<{actorId:string;question:WriterQuestion}>(ENDPOINTS.write.questions,body,await intent.durableHeaders(body,scope));if(result.actorId!==owner||!result.question?.id||result.question.user_id!==owner)throw Error('Invalid question receipt');await intent.complete(scope);return result.question;},onSuccess:row=>{if(useAuthStore.getState().user?.id!==owner)return;void qc.invalidateQueries({queryKey:['write','questions']});setQuestion('');router.push('/write/ask/'+row.id);},onError:()=>Alert.alert(common('error'),t('saveFailed'))});
  if(query.error&&!query.data)return <QueryError error={query.error} retry={()=>void query.refetch()}/>;
  if(query.isLoading)return <LoadingSpinner/>;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={query.data?.pages.flatMap(page=>page.questions)??[]} keyExtractor={row=>row.id} contentContainerStyle={{paddingBottom:24}} ListHeaderComponent={<View className="px-4 py-3 gap-3 border-b border-border"><TextInput editable={!submit.isPending} value={question} onChangeText={setQuestion} placeholder={t('questionLabel')} accessibilityLabel={t('questionLabel')} placeholderTextColor="#9ca3af" className="bg-muted rounded-xl px-3 py-2.5 text-foreground" multiline maxLength={280}/><Button onPress={()=>submit.mutate()} loading={submit.isPending} disabled={question.trim().length<10} size="sm">{t('postQuestion')}</Button><View className="flex-row flex-wrap gap-2">{(['all','unanswered','most_answered'] as const).map(value=><TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{selected:value===filter}} onPress={()=>setFilter(value)} className={`rounded-full border border-border px-3 py-2 ${value===filter?'bg-accent':''}`}><Text className={value===filter?'text-white text-xs':'text-foreground text-xs'}>{t(value)}</Text></TouchableOpacity>)}</View></View>} renderItem={({item})=><TouchableOpacity accessibilityRole="link" onPress={()=>router.push('/write/ask/'+item.id)} className="px-4 py-4 border-b border-border gap-2"><Text className="font-medium text-foreground">{item.question}</Text><Text className="text-xs text-muted-foreground">{t('by',{name:item.author.display_name})} · {t('answers',{count:item.answer_count})}</Text><Text className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString(locale,{timeZone:'UTC'})}</Text></TouchableOpacity>} ListEmptyComponent={<EmptyState title={t('noQuestions')}/>} ListFooterComponent={<View className="p-4 gap-3">{query.error&&<QueryError error={query.error} retry={()=>void query.refetch()}/>} {query.hasNextPage&&<Button loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{common('loadMore')}</Button>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></View>}/></SafeAreaView>;
}

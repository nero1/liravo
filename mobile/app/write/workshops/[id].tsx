import {useTranslations} from '@/hooks/useTranslations';
import {View,Text,ScrollView,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useState} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {useQuery,useInfiniteQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {api,ApiError} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {Button} from '@/components/ui/Button';
import {Input} from '@/components/ui/Input';
import {QueryError,EmptyState} from '@/components/ui/EmptyState';
import {LoadingSpinner} from '@/components/ui/LoadingSpinner';
interface Workshop {id:string;name:string;topic:string|null;member_count:number;is_active:boolean;}
interface Submission {id:string;title:string;excerpt:string;word_count:number;user_id:string;users:{display_name:string;username:string}|null;}
interface Feedback {id:string;comment:string;user_id:string;users:{display_name:string;username:string}|null;}

function WorkshopFeedback({roomId,submissionId,active}:{roomId:string;submissionId:string;active:boolean}){
  const {t}=useTranslations(''),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),qc=useQueryClient(),[comment,setComment]=useState(''),[open,setOpen]=useState(false),scope='workshop.feedback.'+submissionId;
  const path=ENDPOINTS.write.workshopFeedback(roomId,submissionId),query=useInfiniteQuery({queryKey:['write','feedback',owner,roomId,submissionId],enabled:open,queryFn:({pageParam,signal})=>api.get<{feedback:Feedback[];nextCursor:string|null}>(path,{cursor:pageParam},signal),initialPageParam:undefined as string|undefined,getNextPageParam:page=>page.nextCursor??undefined});
  const save=useMutation({mutationFn:async()=>{const body={comment:comment.trim()},result=await api.post<{feedback:{id:string;user_id:string}}>(path,body,await intent.durableHeaders(body,scope));if(!result.feedback?.id||result.feedback.user_id!==owner)throw Error('Invalid feedback receipt');await intent.complete(scope);},onSuccess:()=>{if(useAuthStore.getState().user?.id!==owner)return;setComment('');void qc.invalidateQueries({queryKey:['write','feedback',owner,roomId,submissionId]});Alert.alert(t('nativeWriting.feedbackSaved'));},onError:error=>{if(useAuthStore.getState().user?.id!==owner)return;if(error instanceof ApiError&&error.code==='WORKSHOP_FEEDBACK_EXISTS'){void query.refetch();Alert.alert(t('nativeWriting.feedbackSubmitted'));}else Alert.alert(t('common.error'),t('writing.submitFailure'));}});
  if(!open)return <Button variant="ghost" size="sm" onPress={()=>setOpen(true)}>{t('nativeWriting.feedback')}</Button>;
  return <View className="gap-3">
    {query.isLoading?<LoadingSpinner/>:query.error&&!query.data?<QueryError error={query.error} retry={()=>void query.refetch()}/>:query.data?.pages.flatMap(page=>page.feedback).map(item=><View key={item.id} className="bg-muted rounded-lg p-3"><Text className="text-foreground">{item.comment}</Text><Text className="text-xs text-muted-foreground">{item.users?.display_name??t('writing.writer')}</Text></View>)}
    {query.hasNextPage&&<Button variant="ghost" loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{t(query.isFetchNextPageError?'common.retry':'common.loadMore')}</Button>}
    {query.data?.pages.some(page=>page.feedback.some(item=>item.user_id===owner))?<Text className="text-sm text-muted-foreground">{t('nativeWriting.feedbackSubmitted')}</Text>:active&&<><Input editable={!save.isPending} label={t('nativeWriting.feedback')} placeholder={t('nativeWriting.feedbackPlaceholder')} value={comment} onChangeText={setComment} multiline maxLength={500}/><Button onPress={()=>save.mutate()} loading={save.isPending} disabled={query.isFetching||!!query.error||!comment.trim()}>{t('nativeWriting.sendFeedback')}</Button></>}
  </View>;
}

export default function WorkshopDetailScreen(){
  const {id}=useLocalSearchParams<{id:string}>(),{t}=useTranslations(''),owner=useAuthStore(state=>state.user?.id),qc=useQueryClient(),intent=useRequestIntent(owner),[title,setTitle]=useState(''),[excerpt,setExcerpt]=useState(''),scope='workshop.draft.'+id;
  const result=useQuery({queryKey:['write','workshop',owner,id],enabled:!!id,queryFn:async({signal})=>{const data=await api.get<{actorId:string;room:Workshop}>(ENDPOINTS.write.workshopById(id),{summary:1},signal);if(data.actorId!==owner||data.room?.id!==id)throw Error('Invalid workshop');return data;}});
  const entries=useInfiniteQuery({queryKey:['write','workshopSubmissions',owner,id],enabled:!!result.data,queryFn:({pageParam,signal})=>api.get<{submissions:Submission[];nextCursor:string|null}>(ENDPOINTS.write.workshopSubmissions(id),{cursor:pageParam},signal),initialPageParam:undefined as string|undefined,getNextPageParam:page=>page.nextCursor??undefined});
  const join=useMutation({mutationFn:async()=>{const data=await api.post<{joined:boolean}>(ENDPOINTS.write.joinWorkshop(id),{},{'X-Liravo-Actor':owner??''});if(data.joined!==true)throw Error('Invalid membership receipt');},onSuccess:()=>{if(useAuthStore.getState().user?.id===owner)void qc.invalidateQueries({queryKey:['write']});},onError:()=>Alert.alert(t('common.error'),t('nativeWriting.joinFailed'))});
  const save=useMutation({mutationFn:async()=>{const body={title:title.trim(),excerpt:excerpt.trim()},response=await api.post<{submission:{id:string;user_id:string}}>(ENDPOINTS.write.workshopSubmissions(id),body,await intent.durableHeaders(body,scope));if(!response.submission?.id||response.submission.user_id!==owner)throw Error('Invalid draft receipt');await intent.complete(scope);},onSuccess:()=>{if(useAuthStore.getState().user?.id!==owner)return;setTitle('');setExcerpt('');void qc.invalidateQueries({queryKey:['write','workshopSubmissions',owner,id]});Alert.alert(t('nativeWriting.draftSaved'));},onError:()=>Alert.alert(t('common.error'),t('writing.submitFailure'))});
  if(result.error instanceof ApiError&&result.error.status===403)return <SafeAreaView className="flex-1 bg-background px-4 justify-center gap-4"><Text className="text-foreground">{t('nativeWriting.membersOnly')}</Text><Button loading={join.isPending} onPress={()=>join.mutate()}>{t('nativeWriting.joinWorkshop')}</Button></SafeAreaView>;
  if(result.error)return <QueryError error={result.error} retry={()=>void result.refetch()}/>;
  if(result.isLoading||!result.data)return <LoadingSpinner/>;
  const room=result.data.room;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:16}}>
    <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{room.name}</Text>{room.topic&&<Text className="text-foreground">{room.topic}</Text>}<Text className="text-muted-foreground">{t('nativeWriting.members',{count:room.member_count})}</Text>
    {room.is_active?<><Input editable={!save.isPending} label={t('nativeWriting.draftTitle')} value={title} onChangeText={setTitle} maxLength={200}/><Input editable={!save.isPending} label={t('nativeWriting.excerpt')} value={excerpt} onChangeText={setExcerpt} multiline maxLength={1000} style={{minHeight:120,textAlignVertical:'top'}}/><Button loading={save.isPending} disabled={!title.trim()||!excerpt.trim()} onPress={()=>save.mutate()}>{t('nativeWriting.submitDraft')}</Button></>:<Text className="text-muted-foreground">{t('nativeWriting.workshopClosed')}</Text>}
    <Text accessibilityRole="header" className="font-semibold text-foreground">{t('nativeWriting.submissions')}</Text>
    {entries.isLoading?<LoadingSpinner/>:entries.error&&!entries.data?<QueryError error={entries.error} retry={()=>void entries.refetch()}/>:entries.data?.pages.flatMap(page=>page.submissions).map(entry=><View key={entry.id} className="border border-border rounded-xl p-4 gap-3"><Text className="font-semibold text-foreground">{entry.title}</Text><Text className="text-foreground">{entry.excerpt}</Text><Text className="text-xs text-muted-foreground">{entry.users?.display_name??t('writing.writer')} · {t('writing.wordCount',{count:entry.word_count})}</Text><WorkshopFeedback roomId={id} submissionId={entry.id} active={room.is_active}/></View>)}
    {entries.data?.pages[0].submissions.length===0&&!entries.error&&<EmptyState title={t('nativeWriting.noSubmissions')}/>}
    {entries.hasNextPage&&<Button variant="outline" loading={entries.isFetchingNextPage} onPress={()=>void entries.fetchNextPage()}>{t(entries.isFetchNextPageError?'common.retry':'common.loadMore')}</Button>}
  </ScrollView></SafeAreaView>;
}

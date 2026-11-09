import {useState,useEffect} from 'react';
import {View,Text,FlatList,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useInfiniteQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {Button} from '@/components/ui/Button';
import {Input} from '@/components/ui/Input';
import {EmptyState,QueryError} from '@/components/ui/EmptyState';
import type {ModerationReport,ModerationPage,ModerationAction,ContentReportRow} from '@/types';
type Receipt={actorId:string;reportId:string;report:ContentReportRow};
const valid=(data:Receipt,owner:string|undefined,id:string)=>data?.actorId===owner&&data.reportId===id&&data.report?.id===id;
export default function ModerationReportsScreen(){
  const owner=useAuthStore(state=>state.user?.id),{t}=useTranslations('moderation'),{t:common}=useTranslations('common'),[status,setStatus]=useState('pending');
  const query=useInfiniteQuery({queryKey:['moderation','reports',owner,status],enabled:!!owner,initialPageParam:null as string|null,queryFn:async({pageParam,signal})=>{const data=await api.get<Omit<ModerationPage<ModerationReport>,'items'>&{reports:ModerationReport[]}>('/api/moderation/reports',{status,...pageParam?{cursor:pageParam}:{}},signal);if(data.actorId!==owner||!Array.isArray(data.reports))throw Error('Invalid report queue');return data;},getNextPageParam:page=>page.nextCursor});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={query.data?.pages.flatMap(page=>page.reports)??[]} keyExtractor={report=>report.id} contentContainerStyle={{padding:16,paddingBottom:32,gap:16}} ListHeaderComponent={<View className="gap-3 mb-2"><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t('reports')}</Text>{query.data&&<Text className="text-sm text-muted-foreground">{t('entries',{count:query.data.pages[0].total})}</Text>}<View className="flex-row flex-wrap gap-2">{['pending','escalated','approved','removed','warned','all'].map(value=><Button key={value} variant={status===value?'primary':'outline'} accessibilityState={{selected:status===value}} onPress={()=>setStatus(value)}>{t('statuses.'+value)}</Button>)}</View></View>} renderItem={({item})=><NativeReportReview key={owner+':'+item.id} owner={owner} report={item}/>} ListEmptyComponent={query.isLoading?<Text>{common('loading')}</Text>:query.isError?undefined:<EmptyState title={t('emptyReports')}/>} ListFooterComponent={<View className="gap-3">{query.isError&&<QueryError error={query.error} retry={()=>void query.refetch()}/>} {query.hasNextPage&&<Button loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{common('loadMore')}</Button>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></View>}/></SafeAreaView>;
}
export function NativeReportReview({owner,report}:{owner:string|undefined;report:ModerationReport}){
  const{t,locale}=useTranslations('moderation'),{t:common}=useTranslations('common'),intent=useRequestIntent(owner),qc=useQueryClient(),[note,setNote]=useState(''),scope='report-action:'+report.id;
  const recover=async(key:string)=>{const data=await api.get<Receipt>('/api/moderation/reports',{reportId:report.id,receipt:key});if(!valid(data,owner,report.id)||useAuthStore.getState().user?.id!==owner)throw Error('Invalid report receipt');return data;};
  useEffect(()=>{let active=true;void(async()=>{const headers=await intent.pending(scope);if(!headers)return;try{await recover(headers['Idempotency-Key']);if(active){await intent.complete(scope,headers['Idempotency-Key']);void qc.invalidateQueries({queryKey:['moderation']});}}catch{}})();return()=>{active=false;};},[owner,report.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const update=useMutation({mutationFn:async(action:ModerationAction)=>{
    if(!report.allowed_actions.includes(action))throw Error('Invalid report action');
    const body={action,reason:note.trim()||undefined},headers=await intent.durableHeaders(body,scope);let data:Receipt;
    try{data=await api.post<Receipt>('/api/moderation/reports/'+report.id+'/action',body,headers);if(!valid(data,owner,report.id))throw Error('Invalid report receipt');}catch{data=await recover(headers['Idempotency-Key']);}
    const status={approve:'approved',remove:'removed',warn:'warned',escalate:'escalated'}[action];
    if(useAuthStore.getState().user?.id!==owner||data.report.status!==status||data.report.moderator_id!==owner||data.report.moderator_note!==(body.reason??null))throw Error('Invalid report receipt');
    await intent.complete(scope,headers['Idempotency-Key']);return data;
  },onSuccess:()=>{if(useAuthStore.getState().user?.id===owner)void qc.invalidateQueries({queryKey:['moderation']});},onError:()=>Alert.alert(common('error'),t('unavailable'))});
  return <View className="border border-border rounded-xl p-3 gap-3"><Text className="text-sm text-muted-foreground">{t('entities.'+report.entity_type)} · {t('statuses.'+report.status)} · {new Date(report.created_at).toLocaleString(locale)}</Text><Text className="text-sm text-muted-foreground">{t('reporter',{name:report.reporter.display_name+' (@'+report.reporter.username+')'})}</Text><Text className="font-semibold text-foreground">{report.target.label??t('unknown')}</Text>{!!report.target.username&&<Text className="text-muted-foreground">@{report.target.username}</Text>}{!!report.target.content&&<Text className="text-foreground">{report.target.content}</Text>}<Text className="text-foreground">{t('reason')}: {report.reason}</Text>{!!report.moderator_note&&<Text className="text-muted-foreground">{t('note')}: {report.moderator_note}</Text>}{report.moderator&&<Text className="text-muted-foreground">{t('moderator',{name:report.moderator.display_name})}</Text>}{report.allowed_actions.length?<><Input label={t('note')} value={note} onChangeText={setNote} maxLength={1000} editable={!update.isPending} multiline/><View className="flex-row flex-wrap gap-2">{report.allowed_actions.map(action=><Button key={action} disabled={update.isPending} variant={action==='remove'?'destructive':'outline'} onPress={()=>update.mutate(action)}>{t('actions.'+(action==='remove'&&report.entity_type==='user'?'suspend':action))}</Button>)}</View></>:<Text className="text-muted-foreground">{t('noActions')}</Text>}</View>;
}

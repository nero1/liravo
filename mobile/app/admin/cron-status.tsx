import {View,Text,ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {useTranslations} from '@/hooks/useTranslations';
import {useAuthStore} from '@/stores/auth';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {QueryError} from '@/components/ui/EmptyState';
import {CRON_JOBS} from '../../../src/constants/cron';
interface Health{status:string;timestamp:string;services:Record<string,string>;}
interface Status{pending:number;failed:number;anomalies:Record<string,number>;operations:{windowStart:string;counts:Record<string,number>;alerts:Record<string,boolean>}|null;}
export default function CronStatusScreen(){
  const owner=useAuthStore(state=>state.user?.id),{t,has,locale}=useTranslations('admin.cron'),native=useTranslations('nativeAdmin'),common=useTranslations('common');
  const health=useQuery({queryKey:['health'],queryFn:({signal})=>api.get<Health>(ENDPOINTS.health,undefined,signal),refetchInterval:60000}),query=useQuery({queryKey:['admin',owner,'cron-status'],queryFn:({signal})=>api.get<Status>(ENDPOINTS.admin.cronStatus,undefined,signal),refetchInterval:60000});
  const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value)),number=(value:number)=>new Intl.NumberFormat(locale).format(value),status=(value:string)=>native.has('statuses.'+value)?native.t('statuses.'+value):value;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t('title')}</Text>
    {health.isLoading&&<Text className="text-muted-foreground">{common.t('loading')}</Text>}{health.error&&<QueryError error={health.error} retry={()=>void health.refetch()}/>} {health.data&&<Card className="gap-3"><View className="flex-row justify-between"><Text className="font-semibold text-foreground">{native.t('systemStatus')}</Text><Badge variant={health.data.status==='ok'?'accent':'destructive'}>{status(health.data.status)}</Badge></View><Text className="text-sm text-muted-foreground">{date(health.data.timestamp)}</Text>{Object.entries(health.data.services).map(([key,value])=><View key={key} className="flex-row justify-between"><Text className="text-foreground">{native.has('services.'+key)?native.t('services.'+key):key}</Text><Badge variant={value==='ok'?'accent':'destructive'}>{status(value)}</Badge></View>)}</Card>}
    {query.isLoading&&<Text className="text-muted-foreground">{common.t('loading')}</Text>}{query.error&&<QueryError error={query.error} retry={()=>void query.refetch()}/>} {query.data&&<>
      <Card className="gap-2"><Text className="text-foreground">{t('pending')}: {number(query.data.pending)}</Text><Text className="text-foreground">{t('failed')}: {number(query.data.failed)}</Text></Card>
      <Card className="gap-3"><Text className="font-semibold text-foreground">{t('integrity')}</Text>{Object.entries(query.data.anomalies).map(([key,value])=><View key={key} className="flex-row justify-between gap-3"><Text className="flex-1 text-foreground">{has('anomalies.'+key)?t('anomalies.'+key):key}</Text><Badge variant={value?'destructive':'default'}>{number(value)}</Badge></View>)}</Card>
      <Card className="gap-3"><Text className="font-semibold text-foreground">{t('operations')}</Text>{query.data.operations?<><Text className="text-sm text-muted-foreground">{t('windowStart',{time:date(query.data.operations.windowStart)})}</Text>{Object.entries(query.data.operations.counts).map(([key,value])=><View key={key} className="flex-row justify-between gap-3"><Text className="flex-1 text-foreground">{has('signals.'+key)?t('signals.'+key):key}</Text><Badge variant={query.data!.operations!.alerts[key]?'destructive':'default'}>{number(value)}</Badge></View>)}</>:<Text className="text-muted-foreground">{t('operationsUnavailable')}</Text>}</Card>
    </>}
    <Card className="gap-3"><Text className="font-semibold text-foreground">{t('jobsTitle')}</Text>{CRON_JOBS.map(job=><View key={job.id} className="gap-1"><Text className="font-medium text-foreground">{t('jobs.'+job.id+'.label')}</Text><Text className="text-sm text-muted-foreground">{t('jobs.'+job.id+'.description')}</Text><Text className="text-xs text-muted-foreground">{job.schedule?native.t('utcSchedule',{schedule:job.schedule}):t('external')}</Text></View>)}</Card>
    <Button variant="outline" loading={health.isFetching||query.isFetching} onPress={()=>{void health.refetch();void query.refetch();}}>{native.t('refresh')}</Button>
  </ScrollView></SafeAreaView>;
}

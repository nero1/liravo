import {ScrollView,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Button} from '@/components/ui/Button';
import {QueryError} from '@/components/ui/EmptyState';
import {DebateCard} from '@/components/books/DebateCard';
import type {ReadingDebate} from '@/types';
export default function DebateDetailScreen(){
  const {id}=useLocalSearchParams<{id:string}>(),owner=useAuthStore(state=>state.user?.id),{t}=useTranslations('bookDebates'),{t:common}=useTranslations('common');
  const query=useQuery({queryKey:['debate',owner,id],enabled:!!owner&&!!id,queryFn:async({signal})=>{const data=await api.get<{debate:ReadingDebate;actorId:string}>('/api/debates/'+id,{},signal);if(data.actorId!==owner||data.debate?.id!==id)throw Error('Invalid debate');return data;}});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>{query.data?<DebateCard key={owner+':'+id} initial={query.data.debate} owner={owner} detail/>:query.isLoading?<Text>{common('loading')}</Text>:null}{query.isError&&<QueryError error={query.error} retry={()=>void query.refetch()}/>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></ScrollView></SafeAreaView>;
}

import {useState} from 'react';
import {useRouter} from 'expo-router';
import {View,Text,FlatList} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useInfiniteQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Button} from '@/components/ui/Button';
import {QueryError,EmptyState} from '@/components/ui/EmptyState';
import {DebateCard} from '@/components/books/DebateCard';
import type {ReadingDebatePage} from '@/types';
export default function DebatesScreen(){
  const router=useRouter(),owner=useAuthStore(state=>state.user?.id),{t}=useTranslations('bookDebates'),{t:common}=useTranslations('common'),[scope,setScope]=useState<'active'|'mine'>('active');
  const query=useInfiniteQuery({queryKey:['debates',owner,scope],enabled:!!owner,initialPageParam:null as string|null,queryFn:async({pageParam,signal})=>{const data=await api.get<ReadingDebatePage>('/api/debates',{scope,...(pageParam?{cursor:pageParam}:{})},signal);if(data.actorId!==owner||!Array.isArray(data.debates))throw Error('Invalid debate catalog');return data;},getNextPageParam:page=>page.nextCursor});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={query.data?.pages.flatMap(page=>page.debates)??[]} keyExtractor={debate=>debate.id} contentContainerStyle={{padding:16,paddingBottom:32,gap:16}} ListHeaderComponent={<View className="gap-3 mb-2"><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t('title')}</Text><Text className="text-muted-foreground">{t('description')}</Text><Button onPress={()=>router.push('/debates/new')}>{t('create')}</Button><View className="flex-row gap-2">{(['active','mine']as const).map(value=><Button key={value} variant={scope===value?'primary':'outline'} accessibilityState={{selected:scope===value}} onPress={()=>setScope(value)}>{t(value)}</Button>)}</View></View>} renderItem={({item})=><DebateCard key={owner+':'+item.id} initial={item} owner={owner}/>} ListEmptyComponent={query.isLoading?<Text>{common('loading')}</Text>:query.isError?undefined:<EmptyState title={t('empty')}/>} ListFooterComponent={<View className="gap-3">{query.isError&&<QueryError error={query.error} retry={()=>void query.refetch()}/>} {query.hasNextPage&&<Button loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{common('loadMore')}</Button>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></View>}/></SafeAreaView>;
}

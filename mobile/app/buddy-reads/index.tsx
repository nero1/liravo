import {useState} from 'react';
import {View,Text,FlatList,TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import {useInfiniteQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Button} from '@/components/ui/Button';
import {QueryError,EmptyState} from '@/components/ui/EmptyState';
import type {BuddyReadPage} from '@/types';
export default function BuddyReadsScreen(){
  const owner=useAuthStore(state=>state.user?.id),router=useRouter(),{t}=useTranslations('buddyReads'),{t:room}=useTranslations('buddyReadRoom'),{t:common}=useTranslations('common'),[scope,setScope]=useState<'mine'|'open'>('mine');
  const query=useInfiniteQuery({queryKey:['buddy-reads',owner,scope],enabled:!!owner,initialPageParam:null as string|null,queryFn:async({pageParam,signal})=>{const data=await api.get<BuddyReadPage>('/api/buddy-reads',{scope,...(pageParam?{cursor:pageParam}:{})},signal);if(data.actorId!==owner||!Array.isArray(data.buddy_reads))throw Error('Invalid buddy catalog');return data;},getNextPageParam:page=>page.nextCursor});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={query.data?.pages.flatMap(page=>page.buddy_reads)??[]} keyExtractor={read=>read.id} contentContainerStyle={{padding:16,paddingBottom:32,gap:12}} ListHeaderComponent={<View className="gap-3 mb-2"><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t('title')}</Text><Button onPress={()=>router.push('/buddy-reads/new')}>{t('create')}</Button><View className="flex-row gap-2">{(['mine','open'] as const).map(value=><Button key={value} variant={scope===value?'primary':'outline'} accessibilityState={{selected:scope===value}} onPress={()=>setScope(value)}>{t(value)}</Button>)}</View></View>} renderItem={({item})=><TouchableOpacity accessibilityRole="link" onPress={()=>router.push('/buddy-reads/'+item.id)} className="rounded-xl border border-border p-4 gap-1"><Text className="font-semibold text-foreground">{item.title??item.book.title}</Text><Text className="text-sm text-muted-foreground">{item.book.title} · {item.book.author_name}</Text><Text className="text-sm text-muted-foreground">{room('capacity',{count:item.participant_count,maximum:item.max_participants})} · {room('chapter',{chapter:item.current_chapter})}</Text><Text className="text-xs text-muted-foreground">{room(item.is_active?'active':'ended')}</Text></TouchableOpacity>} ListEmptyComponent={query.isLoading?<Text className="text-muted-foreground">{common('loading')}</Text>:query.isError?null:<EmptyState title={t('empty')}/>} ListFooterComponent={<View className="gap-3">{query.isError&&<QueryError error={query.error} retry={()=>void query.refetch()}/>} {query.hasNextPage&&<Button loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{common('loadMore')}</Button>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></View>}/></SafeAreaView>;
}

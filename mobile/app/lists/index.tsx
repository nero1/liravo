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
import type {ReadingListPage} from '@/types';
export default function ListsScreen(){
  const owner=useAuthStore(state=>state.user?.id),{t}=useTranslations('readingLists'),{t:common}=useTranslations('common'),router=useRouter(),[scope,setScope]=useState<'mine'|'followed'>('mine');
  const query=useInfiniteQuery({queryKey:['lists',owner,scope],enabled:!!owner,initialPageParam:null as string|null,queryFn:async({pageParam,signal})=>{const data=await api.get<ReadingListPage>('/api/lists',{scope,...(pageParam?{cursor:pageParam}:{})},signal);if(data.actorId!==owner||!Array.isArray(data.lists))throw Error('Invalid list catalog');return data;},getNextPageParam:page=>page.nextCursor});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={query.data?.pages.flatMap(page=>page.lists)??[]} keyExtractor={list=>list.id} contentContainerStyle={{padding:16,paddingBottom:32,gap:12}} ListHeaderComponent={<View className="gap-3 mb-2"><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t('title')}</Text><Button onPress={()=>router.push('/lists/new')}>{t('create')}</Button><View className="flex-row gap-2">{(['mine','followed'] as const).map(value=><Button key={value} variant={scope===value?'primary':'outline'} accessibilityState={{selected:scope===value}} onPress={()=>setScope(value)}>{t(value)}</Button>)}</View></View>} renderItem={({item:list})=><TouchableOpacity accessibilityRole="link" onPress={()=>router.push('/lists/'+list.id)} className="rounded-xl border border-border p-4 gap-1"><Text className="font-semibold text-foreground">{list.name}</Text><Text className="text-sm text-muted-foreground">{t('books',{count:list.book_count})} · {t('followers',{count:list.follower_count})} · {t(list.is_public?'publicLabel':'private')}</Text>{!!list.description&&<Text className="text-sm text-muted-foreground">{list.description}</Text>}</TouchableOpacity>} ListEmptyComponent={query.isLoading?<Text className="text-muted-foreground">{common('loading')}</Text>:query.isError?undefined:<EmptyState title={t('empty')}/>} ListFooterComponent={<View className="gap-3">{query.isError&&<QueryError error={query.error} retry={()=>void query.refetch()}/>} {query.hasNextPage&&<Button loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{common('loadMore')}</Button>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></View>}/></SafeAreaView>;
}

import {useEffect,useState} from 'react';
import {View,Text,FlatList,TextInput,type ListRenderItem} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useInfiniteQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Button} from '@/components/ui/Button';
import {EmptyState,QueryError} from '@/components/ui/EmptyState';

const catalogs={users:{path:ENDPOINTS.admin.users,field:'users'},books:{path:ENDPOINTS.admin.books,field:'books'},themes:{path:ENDPOINTS.admin.themes,field:'themes'},promotions:{path:ENDPOINTS.admin.promotedListings,field:'listings'},seasons:{path:ENDPOINTS.admin.seasonalEvents,field:'events'},writing:{path:ENDPOINTS.admin.writingChallenges,field:'challenges'}};
export function AdminCatalog<T extends {id?:string;name?:string}>({scope,title,searchLabel,renderItem}:{scope:keyof typeof catalogs;title:string;searchLabel?:string;renderItem:ListRenderItem<T>}){
  const owner=useAuthStore(state=>state.user?.id),{t}=useTranslations('nativeAdmin'),common=useTranslations('common'),[search,setSearch]=useState(''),[filter,setFilter]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setFilter(search.trim()),300);return()=>clearTimeout(timer);},[search]);
  const definition=catalogs[scope],query=useInfiniteQuery({queryKey:['admin-catalog',owner,scope,filter],enabled:!!owner,initialPageParam:null as string|null,queryFn:async({pageParam,signal})=>{
    const data=await api.get<{actorId:string;total:number;nextCursor:string|null;[key:string]:unknown}>(definition.path,{search:filter,...(pageParam?{cursor:pageParam}:{})},signal);if(data.actorId!==owner||useAuthStore.getState().user?.id!==owner||!Array.isArray(data[definition.field]))throw new Error('Invalid admin catalog');return{rows:data[definition.field] as T[],total:data.total,nextCursor:data.nextCursor};
  },getNextPageParam:page=>page.nextCursor});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={query.data?.pages.flatMap(page=>page.rows)??[]} keyExtractor={item=>item.id??item.name!} renderItem={renderItem} contentContainerStyle={{paddingBottom:24}} ListHeaderComponent={<View className="px-4 py-3 gap-3"><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{title}</Text>{searchLabel&&<TextInput value={search} onChangeText={setSearch} placeholder={searchLabel} accessibilityLabel={searchLabel} autoCapitalize="none" maxLength={200} className="bg-muted rounded-xl px-3 py-2.5 text-foreground border border-border"/>}{query.data&&<Text className="text-sm text-muted-foreground">{t('entries',{count:query.data.pages[0].total})}</Text>}</View>} ListEmptyComponent={query.isLoading?<Text className="px-4 text-muted-foreground">{common.t('loading')}</Text>:query.isError?null:<EmptyState title={t('empty')}/>} ListFooterComponent={<View className="px-4 py-3 gap-3">{query.isError&&<QueryError error={query.error} retry={()=>void query.refetch()}/>} {query.hasNextPage&&<Button disabled={query.isFetchingNextPage} loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{common.t('loadMore')}</Button>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></View>}/></SafeAreaView>;
}

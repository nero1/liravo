import { QueryError , EmptyState } from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
import { Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {Button} from '@/components/ui/Button';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function WorkshopsScreen() {
  const {t:ui}=useTranslations('');
  const router = useRouter();
  const {data,isLoading,error,refetch,hasNextPage,fetchNextPage,isFetchingNextPage,isFetchNextPageError}=useInfiniteQuery({queryKey:['write','workshops'],queryFn:async({pageParam,signal})=>{const data=await api.get<{rooms:{id:string;name:string;topic:string|null;member_count:number}[];nextCursor:string|null}>(ENDPOINTS.write.workshops,{cursor:pageParam},signal);if(!Array.isArray(data.rooms))throw Error('Invalid workshop catalog');return data;},initialPageParam:undefined as string|undefined,getNextPageParam:page=>page.nextCursor??undefined});
  const workshops=data?.pages.flatMap(page=>page.rooms)??[];
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={workshops} keyExtractor={(w) => w.id} renderItem={({ item }) => (
        <TouchableOpacity accessibilityRole="button" className="px-4 py-4 border-b border-border" onPress={() => router.push(`/write/workshops/${item.id}`)} activeOpacity={0.7}>
          <Text className="font-semibold text-foreground">{item.name}</Text>
          {item.topic && <Text className="text-sm text-muted-foreground" numberOfLines={2}>{item.topic}</Text>}
          <Text className="text-xs text-muted-foreground">{ui('nativeWriting.members',{count:item.member_count??0})}</Text>
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title={ui('nativeWriting.noWorkshops')}/>} ListFooterComponent={hasNextPage?<Button variant="ghost" loading={isFetchingNextPage} onPress={()=>void fetchNextPage()}>{ui(isFetchNextPageError?'common.retry':'common.loadMore')}</Button>:undefined} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

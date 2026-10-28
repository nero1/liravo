import {View,Text,FlatList,ActivityIndicator,TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams} from 'expo-router';
import {useInfiniteQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {BookCard} from '@/components/books/BookCard';
import {EmptyState,QueryError} from '@/components/ui/EmptyState';
import {useTranslations} from '@/hooks/useTranslations';
import type {BookRow} from '@/types';

export default function MoodDiscoverScreen(){
  const {tag}=useLocalSearchParams<{tag:string}>(),{t}=useTranslations('discover'),{t:moods}=useTranslations('moods'),{t:common}=useTranslations('common');
  const result=useInfiniteQuery({
    queryKey:['books','mood',tag],
    queryFn:({pageParam,signal})=>api.get<{books:(BookRow&{mood_count:number})[];nextCursor:string|null}>('/api/discover/mood',{mood:tag,cursor:pageParam},signal),
    initialPageParam:undefined as string|undefined,getNextPageParam:page=>page.nextCursor??undefined,enabled:!!tag,
  });
  if(result.error&&!result.data)return <QueryError error={result.error} retry={()=>void result.refetch()}/>;
  const books=result.data?.pages.flatMap(page=>page.books)??[];
  return <SafeAreaView className="flex-1 bg-background" edges={['top']}>
    <View className="px-4 py-3"><Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{t('moodBooks',{mood:moods(tag)})}</Text></View>
    {result.isLoading?<View className="flex-1 items-center justify-center"><ActivityIndicator color="#d97706" size="large"/></View>:<FlatList
      data={books} keyExtractor={book=>book.id} renderItem={({item})=><View className="px-4 py-2"><BookCard book={item} compact/><Text className="text-xs text-muted-foreground">{t('moodReaderCount',{count:item.mood_count})}</Text></View>}
      onEndReached={()=>{if(result.hasNextPage&&!result.isFetchingNextPage&&!result.isFetchNextPageError)void result.fetchNextPage();}} onEndReachedThreshold={0.4}
      ListEmptyComponent={<EmptyState title={t('moodNoBooks')} description={t('moodEmpty')}/>}
      ListFooterComponent={result.isFetchingNextPage?<ActivityIndicator color="#d97706"/>:result.isFetchNextPageError?<TouchableOpacity accessibilityRole="button" onPress={()=>void result.fetchNextPage()} className="p-4"><Text className="text-accent">{common('retry')}</Text></TouchableOpacity>:null}
      contentContainerStyle={{paddingBottom:24}}/>}
  </SafeAreaView>;
}

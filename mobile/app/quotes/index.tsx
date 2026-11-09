import {View,Text,FlatList,TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useInfiniteQuery} from '@tanstack/react-query';
import {useRouter} from 'expo-router';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Button} from '@/components/ui/Button';
import {QueryError,EmptyState} from '@/components/ui/EmptyState';
import {SelectedEdition} from '@/components/books/SelectedEdition';
import type {ReadingQuotePage} from '@/types';
export default function QuotesScreen(){
  const owner=useAuthStore(state=>state.user?.id),{t}=useTranslations('readingQuotes'),{t:common}=useTranslations('common'),router=useRouter();
  const query=useInfiniteQuery({queryKey:['quotes',owner],enabled:!!owner,initialPageParam:null as string|null,queryFn:async({pageParam,signal})=>{const data=await api.get<ReadingQuotePage>('/api/quotes',pageParam?{cursor:pageParam}:{},signal);if(data.actorId!==owner||!Array.isArray(data.quotes)||typeof data.total!=='number')throw Error('Invalid quote catalog');return data;},getNextPageParam:page=>page.nextCursor});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={query.data?.pages.flatMap(page=>page.quotes)??[]} keyExtractor={quote=>quote.id} contentContainerStyle={{padding:16,paddingBottom:32,gap:16}} ListHeaderComponent={<View className="gap-2 mb-2"><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t('title')}</Text><Text className="text-muted-foreground">{t('description')}</Text>{query.data?.pages[0]&&<Text className="text-sm text-muted-foreground">{t('total',{count:query.data.pages[0].total})}</Text>}</View>} renderItem={({item:quote})=><View className="rounded-xl border border-border p-4 gap-3"><Text className="italic text-foreground">{quote.content}</Text><TouchableOpacity accessibilityRole="link" onPress={()=>router.push('/book/'+quote.books.id)}><SelectedEdition book={quote.books}/></TouchableOpacity>{quote.page_number!==null&&<Text className="text-xs text-muted-foreground">{t('page',{number:quote.page_number})}</Text>}</View>} ListEmptyComponent={query.isLoading?<Text>{common('loading')}</Text>:query.isError?undefined:<EmptyState title={t('empty')} description={t('description')}/>} ListFooterComponent={<View className="gap-3">{query.isError&&<QueryError error={query.error} retry={()=>void query.refetch()}/>} {query.hasNextPage&&<Button loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{common('loadMore')}</Button>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></View>}/></SafeAreaView>;
}

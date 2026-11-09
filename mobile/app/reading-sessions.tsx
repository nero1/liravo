import {View,Text,ScrollView,ActivityIndicator} from 'react-native';
import {useLocalSearchParams,useRouter,Stack} from 'expo-router';
import {useInfiniteQuery} from '@tanstack/react-query';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/Button';
import {QueryError} from '@/components/ui/EmptyState';
type Session={id:string;book_id:string;created_at:string;pages_read:number|null;notes:string|null};
export default function ReadingSessions(){const actor=useAuthStore(state=>state.user?.id);return <OwnedHistory key={actor} actor={actor}/>;}
function OwnedHistory({actor}:{actor?:string}){
 const {book_id}=useLocalSearchParams<{book_id?:string}>(),router=useRouter(),{t,locale}=useTranslations('readingHistory'),{t:common}=useTranslations('common');
 const query=useInfiniteQuery({queryKey:['reading-sessions',actor,book_id],initialPageParam:null as string|null,enabled:!!actor,
  queryFn:async({pageParam})=>{const result=await api.get<{actorId:string;sessions:Session[];nextCursor:string|null}>('/api/reading-sessions',{book_id,cursor:pageParam??undefined});if(result.actorId!==actor)throw Error('Account changed');return result;},getNextPageParam:page=>page.nextCursor});
 return <ScrollView className="flex-1 bg-background" contentContainerStyle={{padding:16,gap:16}}><Stack.Screen options={{title:t('title'),headerShown:true}}/>{query.isLoading&&<ActivityIndicator/>}{query.error&&<QueryError error={query.error} retry={()=>void query.refetch()}/>}{query.data?.pages.flatMap(page=>page.sessions).map(session=><View key={session.id} className="border border-border rounded-xl p-4 gap-2"><Button variant="outline" onPress={()=>router.push('/book/'+session.book_id)}>{t('viewBook')}</Button><Text className="text-foreground">{new Date(session.created_at).toLocaleString(locale)}</Text>{session.pages_read!==null&&<Text className="text-foreground">{t('pages',{count:session.pages_read})}</Text>}{session.notes&&<Text className="text-foreground">{session.notes}</Text>}</View>)}{query.data&&!query.data.pages[0].sessions.length&&<Text className="text-foreground">{t('empty')}</Text>}{query.hasNextPage&&<Button loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>{common('loadMore')}</Button>}</ScrollView>;
}

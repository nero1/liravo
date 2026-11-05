import {View,Text,ScrollView,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {api,ApiError} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {Card} from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {QueryError} from '@/components/ui/EmptyState';
import type {ReadingStatsRow} from '@/types';
export default function StatsScreen(){
  const owner=useAuthStore(state=>state.user?.id),{t,locale}=useTranslations('readingStatistics'),genres=useTranslations('aiProfiles'),router=useRouter(),query=useQuery({queryKey:['stats',owner],enabled:!!owner,queryFn:async({signal})=>{const result=await api.get<ReadingStatsRow&{actorId:string}>('/api/stats/reading',undefined,signal);if(result.actorId!==owner||!Number.isFinite(result.booksReadThisYear))throw Error('Invalid reading statistics');return result;}});
  if(query.error instanceof ApiError&&query.error.status===403)return <View className="p-4 gap-4"><Text className="text-foreground">{t('premiumRequired')}</Text><Button onPress={()=>router.push('/premium')}>{t('premiumLink')}</Button></View>;
  if(query.error)return <QueryError error={query.error} retry={()=>void query.refetch()}/>;
  const stats=query.data;if(!stats)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706"/></View>;
  const number=(value:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value),genre=stats.favouriteGenre,genreLabel=genre?(genres.has('genreLabels.'+genre)?genres.t('genreLabels.'+genre):genre):'—',cards=[
    {label:t('books',{year:stats.year}),value:number(stats.booksReadThisYear)},
    {label:t('pages'),value:number(stats.pagesReadThisYear)},
    {label:t('rating'),value:stats.reviewsWrittenThisYear?number(stats.averageRating)+' ★':'—'},
    {label:t('pace'),value:t('paceValue',{count:number(stats.readingPace)})},
    {label:t('genre'),value:genreLabel},
    {label:t('longest'),value:stats.longestBook?stats.longestBook.title+' · '+t('pageCount',{count:stats.longestBook.page_count}):'—'},
    {label:t('currentStreak'),value:t('days',{count:stats.currentReadingStreak})},
    {label:t('maximumStreak'),value:t('days',{count:stats.readingStreakMax})},
    {label:t('reviews'),value:number(stats.reviewsWrittenThisYear)},
    {label:t('quotes'),value:number(stats.quotesSavedThisYear)},
  ];
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{t('title')}</Text><View className="flex-row flex-wrap gap-3">{cards.map(card=><Card key={card.label} className="flex-1 min-w-[45%]"><Text className="text-xl font-bold text-foreground">{card.value}</Text><Text className="text-xs text-muted-foreground">{card.label}</Text></Card>)}</View>{stats.goal.goal&&<Card><Text className="font-semibold text-foreground">{t('goal')}</Text><Text className="text-foreground">{t('goalProgress',{count:stats.goal.progress.books_read,target:stats.goal.goal.target_books})}</Text><Text className="text-muted-foreground">{t('percentage',{count:stats.goal.progress.percentage??0})}</Text></Card>}<Button variant="outline" loading={query.isRefetching} onPress={()=>void query.refetch()}>{t('refresh')}</Button></ScrollView></SafeAreaView>;
}

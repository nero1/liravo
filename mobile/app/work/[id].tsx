import {ScrollView,Text,View,ActivityIndicator} from 'react-native';
import {Stack,useLocalSearchParams} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useTranslations} from '@/hooks/useTranslations';
import {QueryError} from '@/components/ui/EmptyState';
import {EditionSelector} from '@/components/books/EditionSelector';
import type {WorkCatalog} from '@/types';
export default function WorkScreen(){
  const {id}=useLocalSearchParams<{id:string}>(),{t}=useTranslations('editions');
  const {data,error,isLoading,refetch}=useQuery({queryKey:['work',id],queryFn:()=>api.get<WorkCatalog>('/api/works/'+id),enabled:!!id});
  if(error)return <><Stack.Screen options={{title:t('title')}}/><QueryError error={error} retry={()=>void refetch()}/></>;
  if(isLoading||!data)return <><Stack.Screen options={{title:t('title')}}/><View className="flex-1 items-center justify-center bg-background"><ActivityIndicator accessibilityLabel={t('title')}/></View></>;
  return <><Stack.Screen options={{title:t('title')}}/><ScrollView className="flex-1 bg-background" contentContainerStyle={{padding:16,gap:20}}>
    <View><Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{data.work.title}</Text><Text className="text-muted-foreground">{data.work.author_name}</Text></View>
    <Text className="text-sm text-muted-foreground">{t('workRatings',{count:data.statistics.ratings_count})}</Text>
    <EditionSelector catalog={data}/>
  </ScrollView></>;
}

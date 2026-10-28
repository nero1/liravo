import {View,Text,FlatList,ActivityIndicator,TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useRouter} from 'expo-router';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {Avatar} from '@/components/ui/Avatar';
import {EmptyState} from '@/components/ui/EmptyState';
import {Button} from '@/components/ui/Button';
import {useTranslations} from '@/hooks/useTranslations';

type Entry={user_id:string;username:string;display_name:string|null;avatar_url:string|null;want_to_read_score:number;is_verified_author:boolean};
export default function CreatorLeaderboardScreen(){
  const {t,locale}=useTranslations('creator'),common=useTranslations('common'),router=useRouter();
  const {data,isLoading,error,refetch}=useQuery({queryKey:['creator','leaderboard'],queryFn:()=>api.get<{leaderboard:Entry[];week_start:string}>(ENDPOINTS.creator.leaderboard)});
  if(isLoading)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" accessibilityLabel={common.t('loading')}/></View>;
  if(error||!data)return <View className="flex-1 justify-center p-6 gap-4"><Text accessibilityLiveRegion="polite" className="text-destructive">{t('unavailable')}</Text><Button onPress={()=>void refetch()}>{common.t('retry')}</Button></View>;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={data.leaderboard} keyExtractor={entry=>entry.user_id} ListHeaderComponent={<View className="p-4 gap-2"><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t('leaderboard')}</Text><Text className="text-muted-foreground">{t('weeklyDescription',{date:new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(data.week_start))})}</Text></View>} renderItem={({item,index})=><TouchableOpacity accessibilityRole="link" onPress={()=>router.push(`/user/${item.username}`)} className="flex-row items-center px-4 py-3 border-b border-border gap-3"><Text className="w-8 text-center font-bold text-accent">{(index+1).toLocaleString(locale)}</Text><Avatar uri={item.avatar_url} name={item.display_name??item.username} size={40}/><View className="flex-1"><Text className="font-semibold text-foreground">{item.display_name??item.username}</Text><Text className="text-xs text-muted-foreground">@{item.username}</Text>{item.is_verified_author&&<Text className="text-xs text-accent">{t('verifiedAuthor')}</Text>}</View><Text accessibilityLabel={t('weeklyConversions')} className="font-bold text-accent">{item.want_to_read_score.toLocaleString(locale)}</Text></TouchableOpacity>} ListEmptyComponent={<EmptyState title={t('empty')}/>} contentContainerStyle={{paddingBottom:24}}/></SafeAreaView>;
}

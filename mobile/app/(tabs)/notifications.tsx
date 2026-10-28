import {FlatList,View,Text,TouchableOpacity,RefreshControl,ActivityIndicator,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useState,useEffect} from 'react';
import {formatDistance} from 'date-fns';
import {fr} from 'date-fns/locale/fr';
import {de} from 'date-fns/locale/de';
import {Bell} from 'lucide-react-native';
import {useNotifications,useMarkNotificationRead} from '@/hooks/useNotifications';
import {useTranslations} from '@/hooks/useTranslations';
import {useAuthStore} from '@/stores/auth';
import {Avatar} from '@/components/ui/Avatar';
import {EmptyState,QueryError} from '@/components/ui/EmptyState';
import {notificationText} from '../../../src/lib/notification-message';

export default function NotificationsScreen(){
  const {t,has,locale}=useTranslations(''),owner=useAuthStore(state=>state.user?.id),result=useNotifications(),markRead=useMarkNotificationRead(),[now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
  const notifications=result.data?.pages.flatMap(page=>page.notifications)??[];
  if(result.error&&!result.data)return <QueryError error={result.error} retry={()=>void result.refetch()}/>;
  if(result.data?.pages.some(page=>page.actorId!==owner))return <QueryError error={new Error('Account changed')} retry={()=>void result.refetch()}/>;
  return <SafeAreaView className="flex-1 bg-background" edges={['top']}>
    <View className="px-4 py-3 border-b border-border"><Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{t('nav.notifications')}</Text></View>
    <FlatList data={notifications} keyExtractor={item=>item.id}
      renderItem={({item})=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:markRead.isPending}} disabled={markRead.isPending} onPress={()=>{if(!item.is_read)markRead.mutate(item.id,{onError:()=>Alert.alert(t('common.error'),t('notificationList.markFailed'))});}} className={'flex-row px-4 py-3 gap-3 border-b border-border '+(!item.is_read?'bg-accent/5':'')}>
        <Avatar uri={item.actor?.avatar_url} name={item.actor?.display_name} size={40}/><View className="flex-1 gap-0.5"><Text className="text-foreground text-sm">{notificationText(item,t,has,locale)}</Text><Text className="text-xs text-muted-foreground">{formatDistance(new Date(item.created_at),now,{addSuffix:true,locale:locale==='fr'?fr:locale==='de'?de:undefined})}</Text></View>{!item.is_read&&<View accessibilityLabel={t('notificationList.unread',{count:1})} className="w-2 h-2 bg-accent rounded-full self-center"/>}
      </TouchableOpacity>}
      ListEmptyComponent={!result.isLoading?<EmptyState title={t('notificationList.empty')} description={t('notificationList.emptyDetail')} icon={<Bell size={48} color="#6b7280"/>}/>:null}
      ListHeaderComponent={result.isLoading?<View className="py-8 items-center"><ActivityIndicator accessibilityLabel={t('common.loading')} color="#d97706"/></View>:null}
      onEndReached={()=>{if(result.hasNextPage&&!result.isFetchingNextPage&&!result.isFetchNextPageError)void result.fetchNextPage();}} onEndReachedThreshold={0.4}
      ListFooterComponent={result.isFetchingNextPage?<ActivityIndicator accessibilityLabel={t('common.loading')} color="#d97706"/>:result.isFetchNextPageError?<TouchableOpacity accessibilityRole="button" onPress={()=>void result.fetchNextPage()} className="p-4"><Text className="text-accent">{t('common.retry')}</Text></TouchableOpacity>:null}
      refreshControl={<RefreshControl refreshing={result.isRefetching&&!result.isFetchingNextPage} onRefresh={()=>void result.refetch()} tintColor="#d97706"/>} contentContainerStyle={{paddingBottom:20}}/>
  </SafeAreaView>;
}

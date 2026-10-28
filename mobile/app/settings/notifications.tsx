import {View,Text,Switch,ScrollView,ActivityIndicator,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useState,useEffect,useRef,useCallback} from 'react';
import {useTranslations} from '@/hooks/useTranslations';
import {useAuthStore} from '@/stores/auth';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {QueryError} from '@/components/ui/EmptyState';
import type {UserRow} from '@/types';
import {NOTIFICATION_KEYS,readNotificationPreferences,type NotificationPreferences,type NotificationPreferenceKey} from '../../../src/lib/notification-preferences';

export default function NotificationSettingsScreen(){
  const {t}=useTranslations('notificationPreferences'),{t:common}=useTranslations('common'),owner=useAuthStore(state=>state.user?.id),queryClient=useQueryClient(),busy=useRef(false),mounted=useRef(true);
  const [prefs,setPrefs]=useState<NotificationPreferences|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const select=useCallback((data:{user:UserRow})=>{if(data.user.id!==owner)throw new Error('Account changed');return {...data,preferences:readNotificationPreferences(data.user)};},[owner]);
  const result=useQuery({queryKey:['me'],queryFn:({signal})=>api.get<{user:UserRow}>(ENDPOINTS.users.me,undefined,signal),select,enabled:!!owner});
  useEffect(()=>{if(result.data)setPrefs(result.data.preferences);},[result.data]);
  const save=useMutation({
    mutationFn:async(change:{key:NotificationPreferenceKey;value:boolean;token:string|null})=>{
      const current=useAuthStore.getState();if(current.user?.id!==owner||current.token!==change.token)throw new Error('Account changed');
      const response=await api.patch<{ok:boolean;user:UserRow}>(ENDPOINTS.users.profile,{[change.key]:change.value},{'X-Liravo-Actor':owner!});
      if(!response.ok||response.user?.id!==owner)throw new Error('Invalid preference receipt');
      readNotificationPreferences(response.user);return response.user;
    },
    onSuccess:(user,change)=>{
      const current=useAuthStore.getState();if(current.user?.id!==owner||current.token!==change.token)return;
      current.setUser(user);queryClient.setQueryData(['me'],{user});
    },
    onError:(_error,change)=>{
      const current=useAuthStore.getState();if(!mounted.current||current.user?.id!==owner||current.token!==change.token)return;
      if(result.data)setPrefs(result.data.preferences);Alert.alert(common('error'),t('saveFailed'));
    },
  });
  function toggle(key:NotificationPreferenceKey){
    if(busy.current||!prefs)return;busy.current=true;
    const value=!prefs[key];setPrefs({...prefs,[key]:value});
    save.mutate({key,value,token:useAuthStore.getState().token},{onSettled:()=>{busy.current=false;}});
  }
  if(result.error)return <QueryError error={result.error} retry={()=>void result.refetch()}/>;
  if(result.isLoading||!prefs)return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator accessibilityLabel={common('loading')} color="#d97706"/></View>;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:12}}>
    <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{t('title')}</Text><Text className="text-muted-foreground">{t('description')}</Text>
    <Text className="text-sm text-muted-foreground">{t('paidEmail')}</Text>
    {NOTIFICATION_KEYS.map(key=><View key={key} className="flex-row items-center justify-between p-4 rounded-xl border border-border bg-card gap-4"><Text className="text-sm text-foreground flex-1">{t('flags.'+key)}</Text><Switch accessibilityLabel={t('flags.'+key)} accessibilityState={{checked:prefs[key],disabled:save.isPending}} disabled={save.isPending} value={prefs[key]} onValueChange={()=>toggle(key)} trackColor={{false:'#e5e7eb',true:'#d97706'}} thumbColor="#ffffff"/></View>)}
    {save.isPending&&<Text accessibilityRole="text" className="text-muted-foreground">{common('saving')}</Text>}
  </ScrollView></SafeAreaView>;
}

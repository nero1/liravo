import {View,Text,FlatList,Switch} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {useTranslations} from '@/hooks/useTranslations';
import {useAuthStore} from '@/stores/auth';
import {useAdminChange} from '@/hooks/useAdminChange';
import {EmptyState,QueryError} from '@/components/ui/EmptyState';
import {LoadingSpinner} from '@/components/ui/LoadingSpinner';
import type {FeatureFlagRow} from '@/types';
export default function FeatureFlagsScreen(){
  const owner=useAuthStore(state=>state.user?.id),{t}=useTranslations('admin'),native=useTranslations('nativeAdmin');
  const query=useQuery({queryKey:['admin',owner,'feature-flags'],queryFn:({signal})=>api.get<{flags:FeatureFlagRow[]}>(ENDPOINTS.admin.featureFlags,undefined,signal)});
  const change=useAdminChange<{name:string;enabled:boolean}>({path:ENDPOINTS.admin.featureFlags,catalog:'flags',scope:body=>'admin.flag.'+body.name,validate:(result,body)=>result.updated===true&&result.name===body.name&&result.enabled===body.enabled});
  if(query.error)return <QueryError error={query.error} retry={()=>void query.refetch()}/>;if(query.isLoading)return <LoadingSpinner/>;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><FlatList data={query.data?.flags??[]} keyExtractor={flag=>flag.id} renderItem={({item})=><View className="flex-row items-center px-4 py-4 border-b border-border gap-3"><View className="flex-1"><Text className="font-medium text-foreground">{item.name}</Text>{item.description&&<Text className="text-sm text-muted-foreground">{item.description}</Text>}</View><Switch disabled={change.isPending} value={item.enabled} accessibilityLabel={native.t('activate',{name:item.name})} onValueChange={enabled=>change.mutate({name:item.name,enabled})}/></View>} ListEmptyComponent={<EmptyState title={t('noFeatureFlagsFound')}/>} contentContainerStyle={{paddingBottom:24}}/></SafeAreaView>;
}

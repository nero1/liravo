import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Badge } from '@/components/ui/Badge';
import {QueryError,EmptyState} from '@/components/ui/EmptyState';
import {useAuthStore} from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { AffiliateStoreRow } from '@/types';

export default function AffiliateStoresScreen() {
  const {t:ui}=useTranslations(''),owner=useAuthStore(state=>state.user?.id);
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['admin',owner,'affiliate-stores'], queryFn: () => api.get<{ stores: AffiliateStoreRow[] }>(ENDPOINTS.admin.affiliateStores) });
  const stores = data?.stores ?? [];
  if(error)return <QueryError error={error} retry={()=>void refetch()}/>;
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={stores} keyExtractor={(s) => s.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border gap-1">
          <View className="flex-row items-center gap-2"><Text className="font-semibold text-foreground flex-1">{item.name}</Text>{item.is_active ? <Badge variant="accent">{ui('admin.active')}</Badge> : <Badge>{ui('admin.inactive')}</Badge>}</View>
          <Text className="text-sm text-muted-foreground">{item.countries.join(', ')}</Text>
          {item.affiliate_tag && <Text className="text-xs text-muted-foreground">{ui('admin.tag')}{item.affiliate_tag}</Text>}
        </View>
      )} ListEmptyComponent={<EmptyState title={ui('nativeAdmin.empty')}/>} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

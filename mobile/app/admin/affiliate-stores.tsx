import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { AffiliateStoreRow } from '@/types';

export default function AffiliateStoresScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'affiliate-stores'], queryFn: () => api.get<{ stores: AffiliateStoreRow[] }>(ENDPOINTS.admin.affiliateStores) });
  const stores = data?.stores ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={stores} keyExtractor={(s) => s.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border gap-1">
          <View className="flex-row items-center gap-2"><Text className="font-semibold text-foreground flex-1">{item.name}</Text>{item.is_active ? <Badge variant="accent">Active</Badge> : <Badge>Inactive</Badge>}</View>
          <Text className="text-sm text-muted-foreground">{item.countries.join(', ')}</Text>
          {item.affiliate_tag && <Text className="text-xs text-muted-foreground">Tag: {item.affiliate_tag}</Text>}
        </View>
      )} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

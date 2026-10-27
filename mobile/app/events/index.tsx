import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState,QueryError } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useTranslations } from '@/hooks/useTranslations';
import { useAuthStore } from '@/stores/auth';

export default function EventsScreen() {
  const router = useRouter();
  const {t,locale}=useTranslations('events');
  const user=useAuthStore(state=>state.user);
  const canCreate=user?.is_admin||user?.is_verified_author||user?.user_types.some(role=>['author','creator'].includes(role));
  const { data, isLoading,error,refetch } = useQuery({ queryKey: ['events'], queryFn: () => api.get<{ events: any[] }>(ENDPOINTS.events.list) });
  const events = data?.events ?? [];
  if(error)return <QueryError error={error} retry={()=>void refetch()} />;
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xl font-bold text-foreground">{t('title')}</Text>
        {canCreate&&<TouchableOpacity accessibilityRole="button" accessibilityLabel={t('createEvent')} onPress={() => router.push('/events/new')}><Plus size={22} color="#d97706" /></TouchableOpacity>}
      </View>
      <FlatList data={events} keyExtractor={(e) => e.id} renderItem={({ item }) => (
        <TouchableOpacity accessibilityRole="link" className="px-4 py-4 border-b border-border" onPress={() => router.push(`/events/${item.id}`)} activeOpacity={0.7}>
          <Text className="font-semibold text-foreground">{item.title}</Text>
          {item.event_date && <Text className="text-sm text-muted-foreground">{new Date(item.event_date).toLocaleDateString(locale)}</Text>}
        </TouchableOpacity>
      )} ListEmptyComponent={<EmptyState title={t('noEvents')} />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

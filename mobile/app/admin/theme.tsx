import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AdminThemeScreen() {
  const {t:ui}=useTranslations('');
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'themes'], queryFn: () => api.get<{ themes: any[] }>(ENDPOINTS.admin.themes) });
  const themes = data?.themes ?? [];
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList data={themes} keyExtractor={(t) => t.id} renderItem={({ item }) => (
        <View className="flex-row items-center px-4 py-4 border-b border-border gap-3">
          <View className="w-8 h-8 rounded-full" style={{ backgroundColor: item.accent_color ?? '#d97706' }} />
          <Text className="font-medium text-foreground flex-1">{item.name}</Text>
          {item.is_active && <Text className="text-accent text-sm">{ui('admin.active')}</Text>}
        </View>
      )} ListEmptyComponent={<EmptyState title="No themes" />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

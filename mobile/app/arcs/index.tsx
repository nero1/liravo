import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface ARC {
  id: string;
  description: string | null;
  reader_slots: number;
  close_date: string | null;
  my_application_status: 'pending' | 'approved' | 'rejected' | null;
  approved_count: number;
  slots_remaining: number;
  books: { id: string; title: string; author_name: string; cover_url: string | null } | null;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  approved: { label: 'Approved', color: 'text-green-600 bg-green-50 border-green-200' },
  rejected: { label: 'Declined', color: 'text-red-500 bg-red-50 border-red-200' },
};

export default function ARCsScreen() {
  const {t:ui}=useTranslations('');
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['arcs'],
    queryFn: () => api.get<{ arcs: ARC[] }>('/api/arcs'),
  });

  const applyMutation = useMutation({
    mutationFn: (arcId: string) => api.post(`/api/author/arcs/${arcId}/apply`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['arcs'] }),
  });

  const arcs = data?.arcs ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#d97706" />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
      >
        <View>
          <Text className="text-2xl font-bold text-foreground">{ui('nativeNavigation.aRCLibrary')}</Text>
          <Text className="text-muted-foreground text-sm mt-1">Apply to receive advance reading copies.</Text>
        </View>

        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#d97706" />
          </View>
        ) : arcs.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">📚</Text>
            <Text className="text-muted-foreground">No ARCs available right now.</Text>
          </View>
        ) : (
          arcs.map((arc) => (
            <View key={arc.id} className="rounded-xl border border-border bg-card p-4">
              <View className="flex-row gap-3">
                {arc.books?.cover_url ? (
                  <Image
                    source={{ uri: arc.books.cover_url }}
                    style={{ width: 56, height: 80, borderRadius: 6 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="w-14 h-20 rounded-md bg-muted items-center justify-center">
                    <Text className="text-2xl">📖</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="font-semibold text-foreground" numberOfLines={2}>{arc.books?.title ?? 'Unknown'}</Text>
                  <Text className="text-sm text-muted-foreground">{arc.books?.author_name}</Text>
                  {arc.description && (
                    <Text className="text-xs text-muted-foreground mt-1" numberOfLines={2}>{arc.description}</Text>
                  )}
                  <View className="flex-row items-center gap-3 mt-2">
                    <Text className="text-xs text-muted-foreground">{arc.slots_remaining} slot{arc.slots_remaining !== 1 ? 's' : ''} left</Text>
                    {arc.close_date && (
                      <Text className="text-xs text-muted-foreground">Closes {new Date(arc.close_date).toLocaleDateString()}</Text>
                    )}
                  </View>
                </View>
              </View>

              <View className="mt-3">
                {arc.my_application_status ? (
                  <View className={`self-start px-3 py-1 rounded-full border text-xs font-medium ${STATUS_BADGE[arc.my_application_status]?.color ?? ''}`}>
                    <Text className={`text-xs font-medium ${arc.my_application_status === 'approved' ? 'text-green-600' : arc.my_application_status === 'rejected' ? 'text-red-500' : 'text-amber-600'}`}>
                      {STATUS_BADGE[arc.my_application_status]?.label}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => applyMutation.mutate(arc.id)}
                    disabled={applyMutation.isPending || arc.slots_remaining === 0}
                    className="bg-accent rounded-lg py-2 items-center disabled:opacity-50"
                  >
                    <Text className="text-white text-sm font-semibold">
                      {arc.slots_remaining === 0 ? 'Full' : applyMutation.isPending ? 'Applying…' : 'Apply'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

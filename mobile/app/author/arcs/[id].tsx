import { View, Text, FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

export default function ARCDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['author', 'arc', id], queryFn: () => api.get<{ arc: any; applications: any[] }>(`/api/author/arcs/${id}/applications`), enabled: !!id });
  const approve = useMutation({ mutationFn: (appId: string) => api.post(`/api/author/arcs/${id}/approve`, { applicationId:appId,approved:true }), onSuccess: () => qc.invalidateQueries({ queryKey: ['author', 'arc', id] }), onError: (err) => Alert.alert('Error', (err as Error).message) });
  const arc = data?.arc;
  const applications = data?.applications ?? [];
  if (isLoading || !arc) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-3 border-b border-border"><Text className="text-xl font-bold text-foreground">{arc.title}</Text><Text className="text-sm text-muted-foreground">{applications.length} applications</Text></View>
      <FlatList data={applications} keyExtractor={(a) => a.id} renderItem={({ item }) => (
        <View className="flex-row items-center px-4 py-3 border-b border-border gap-3">
          <Avatar uri={item.reader?.avatar_url} name={item.reader?.display_name} size={40} />
          <View className="flex-1"><Text className="font-medium text-foreground">{item.reader?.display_name}</Text><Text className="text-sm text-muted-foreground">@{item.reader?.username}</Text></View>
          {item.status === 'pending' && <Button onPress={() => approve.mutate(item.id)} loading={approve.isPending} size="sm">Approve</Button>}
          {item.status === 'approved' && <Text className="text-accent text-sm">Approved</Text>}
        </View>
      )} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

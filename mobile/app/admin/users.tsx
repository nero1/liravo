import { View, Text, FlatList, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AdminUsersScreen() {
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'users', search], queryFn: () => api.get<{ users: any[] }>(ENDPOINTS.admin.users, { search: search || undefined }), enabled: true });
  const moderate = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => api.patch(ENDPOINTS.admin.users, { user_id: id, action }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }), onError: (err) => Alert.alert('Error', (err as Error).message) });
  const users = data?.users ?? [];
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-2"><TextInput value={search} onChangeText={setSearch} placeholder="Search users..." placeholderTextColor="#9ca3af" className="bg-muted rounded-xl px-3 py-2.5 text-foreground border border-border" /></View>
      {isLoading ? <LoadingSpinner /> : (
        <FlatList data={users} keyExtractor={(u) => u.id} renderItem={({ item }) => (
          <View className="flex-row items-center px-4 py-3 border-b border-border gap-3">
            <Avatar uri={item.avatar_url} name={item.display_name} size={40} />
            <View className="flex-1">
              <Text className="font-medium text-foreground">{item.display_name}</Text>
              <Text className="text-xs text-muted-foreground">@{item.username}</Text>
              <View className="flex-row gap-1 mt-0.5 flex-wrap">
                {item.is_suspended && <Badge variant="destructive">Suspended</Badge>}
                {item.is_banned && <Badge variant="destructive">Banned</Badge>}
                {item.is_admin && <Badge variant="accent">Admin</Badge>}
              </View>
            </View>
            <TouchableOpacity onPress={() => Alert.alert('Actions', 'Moderate this user', [{ text: 'Suspend', onPress: () => moderate.mutate({ id: item.id, action: 'suspend' }) }, { text: 'Unsuspend', onPress: () => moderate.mutate({ id: item.id, action: 'unsuspend' }) }, { text: 'Cancel', style: 'cancel' }])} className="p-2"><Text className="text-muted-foreground">···</Text></TouchableOpacity>
          </View>
        )} contentContainerStyle={{ paddingBottom: 24 }} />
      )}
    </SafeAreaView>
  );
}

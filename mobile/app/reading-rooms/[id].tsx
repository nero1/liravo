import { QueryError } from '@/components/ui/EmptyState';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/Button';

interface Milestone { id: string; title: string; unlock_date: string; }
interface PostAuthor { id: string; display_name: string; username: string; avatar_url: string | null; }
interface Post { id: string; content: string; milestone_id: string | null; created_at: string; users: PostAuthor | null; }

export default function ReadingRoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const user=useAuthStore(state=>state.user);

  const [tab, setTab] = useState<'discussion' | 'milestones'>('discussion');
  const [postContent, setPostContent] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const [showAddMilestone, setShowAddMilestone] = useState(false);

  const { data: roomData, isLoading,error,refetch } = useQuery({
    queryKey: ['reading-room', id],
    queryFn: () => api.get<{ room: { id: string; name: string; created_by: string; is_active: boolean;is_member:boolean } }>(ENDPOINTS.readingRooms.byId(id!)),
    enabled: !!id,
  });

  const { data: milestonesData } = useQuery({
    queryKey: ['room-milestones', id],
    queryFn: () => api.get<{ milestones: Milestone[] }>(`/api/reading-rooms/${id}/milestones`),
    enabled: !!id,
  });

  const { data: postsData, refetch: refetchPosts } = useQuery({
    queryKey: ['room-posts', id],
    queryFn: () => api.get<{ posts: Post[] }>(`/api/reading-rooms/${id}/posts`),
    enabled: !!id,
  });

  const joinMutation = useMutation({
    mutationFn: () => api.post(ENDPOINTS.readingRooms.join(id!)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reading-room', id] }); Alert.alert('Joined!'); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  const postMutation = useMutation({
    mutationFn: (data: { content: string; milestone_id: string | null }) =>
      api.post(`/api/reading-rooms/${id}/posts`, data),
    onSuccess: () => { setPostContent(''); refetchPosts(); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  const addMilestoneMutation = useMutation({
    mutationFn: (data: { title: string; unlock_date: string }) =>
      api.post(`/api/reading-rooms/${id}/milestones`, data),
    onSuccess: () => {
      setNewMilestoneTitle('');
      setMilestoneDate('');
      setShowAddMilestone(false);
      qc.invalidateQueries({ queryKey: ['room-milestones', id] });
    },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  const room = roomData?.room;
  const milestones = milestonesData?.milestones ?? [];
  const posts = postsData?.posts ?? [];

  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

  if (isLoading || !room) {
    return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  }

  const filteredPosts = selectedMilestone
    ? posts.filter((p) => p.milestone_id === selectedMilestone)
    : posts.filter((p) => !p.milestone_id);

  const unlockedMilestones = milestones.filter((m) => new Date(m.unlock_date) <= new Date());

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-1">
        {/* Header */}
        <View className="px-4 pt-4 pb-2 border-b border-border">
          <Text className="text-xl font-bold text-foreground">{room.name}</Text>
          {!room.is_member&&room.is_active&&<Button onPress={()=>joinMutation.mutate()} loading={joinMutation.isPending}>Join room</Button>}
          <View className="flex-row gap-2 mt-2">
            {(['discussion', 'milestones'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                className={`px-3 py-1.5 rounded-full ${tab === t ? 'bg-accent' : 'bg-muted'}`}
              >
                <Text className={`text-xs font-medium capitalize ${tab === t ? 'text-white' : 'text-muted-foreground'}`}>
                  {t}{t === 'milestones' && milestones.length > 0 ? ` (${milestones.length})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {tab === 'milestones' && (
          <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
            {milestones.length === 0 && (
              <Text className="text-muted-foreground text-sm text-center py-8">No milestones yet.</Text>
            )}
            {milestones.map((m) => {
              const unlocked = new Date(m.unlock_date) <= new Date();
              return (
                <View
                  key={m.id}
                  className={`rounded-xl border p-4 ${unlocked ? 'border-accent/40 bg-accent/5' : 'border-border bg-muted/30'}`}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xl">{unlocked ? '🔓' : '🔒'}</Text>
                    <View className="flex-1">
                      <Text className="font-semibold text-foreground text-sm">{m.title}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {unlocked ? 'Unlocked ' : 'Unlocks '}
                        {new Date(m.unlock_date).toLocaleDateString()}
                      </Text>
                    </View>
                    {unlocked && (
                      <TouchableOpacity onPress={() => { setSelectedMilestone(m.id); setTab('discussion'); }}>
                        <Text className="text-xs text-accent">View posts →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}

            {room.created_by===user?.id&&(showAddMilestone ? (
              <View className="rounded-xl border border-dashed border-border p-4 gap-3">
                <Text className="font-semibold text-sm text-foreground">Add Milestone</Text>
                <TextInput
                  value={newMilestoneTitle}
                  onChangeText={setNewMilestoneTitle}
                  placeholder="Chapter name or page range…"
                  placeholderTextColor="#9ca3af"
                  className="border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background"
                />
                <TextInput
                  value={milestoneDate}
                  onChangeText={setMilestoneDate}
                  placeholder="Unlock date (YYYY-MM-DDTHH:MM)"
                  placeholderTextColor="#9ca3af"
                  className="border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background"
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity onPress={() => setShowAddMilestone(false)} className="flex-1 border border-border rounded-lg py-2 items-center">
                    <Text className="text-sm text-muted-foreground">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (newMilestoneTitle && Number.isFinite(new Date(milestoneDate).getTime())) {
                        addMilestoneMutation.mutate({ title: newMilestoneTitle, unlock_date: new Date(milestoneDate).toISOString() });
                      }
                    }}
                    disabled={addMilestoneMutation.isPending}
                    className="flex-1 bg-accent rounded-lg py-2 items-center"
                  >
                    <Text className="text-sm text-white font-medium">{addMilestoneMutation.isPending ? 'Adding…' : 'Add'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowAddMilestone(true)} className="border border-dashed border-border rounded-xl py-3 items-center">
                <Text className="text-sm text-accent font-medium">+ Add Milestone</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {tab === 'discussion' && (
          <>
            {/* Milestone filter pills */}
            {unlockedMilestones.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-border" contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setSelectedMilestone(null)}
                  className={`px-3 py-1 rounded-full ${!selectedMilestone ? 'bg-accent' : 'bg-muted'}`}
                >
                  <Text className={`text-xs font-medium ${!selectedMilestone ? 'text-white' : 'text-muted-foreground'}`}>General</Text>
                </TouchableOpacity>
                {unlockedMilestones.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setSelectedMilestone(m.id)}
                    className={`px-3 py-1 rounded-full ${selectedMilestone === m.id ? 'bg-accent' : 'bg-muted'}`}
                  >
                    <Text className={`text-xs font-medium ${selectedMilestone === m.id ? 'text-white' : 'text-muted-foreground'}`}>{m.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <FlatList
              data={filteredPosts}
              keyExtractor={(p) => p.id}
              className="flex-1 px-4"
              contentContainerStyle={{ paddingVertical: 12, gap: 12 }}
              renderItem={({ item }) => (
                <View className="flex-row gap-2">
                  <Avatar uri={item.users?.avatar_url ?? null} name={item.users?.display_name ?? '?'} size={32} />
                  <View className="flex-1">
                    <Text className="text-xs text-muted-foreground mb-0.5">{item.users?.display_name ?? 'Unknown'}</Text>
                    <View className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                      <Text className="text-sm text-foreground">{item.content}</Text>
                    </View>
                    <Text className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text className="text-center text-muted-foreground text-sm py-8">No messages yet. Start the conversation!</Text>
              }
            />

            {/* Post composer */}
            {room.is_member&&room.is_active&&<View className="px-4 pb-4 pt-2 border-t border-border flex-row gap-2 items-end">
              <TextInput
                value={postContent}
                onChangeText={setPostContent}
                placeholder="Say something…"
                placeholderTextColor="#9ca3af"
                multiline
                maxLength={2000}
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background"
                style={{ maxHeight: 80 }}
              />
              <TouchableOpacity
                onPress={() => { if (postContent.trim()) postMutation.mutate({ content: postContent.trim(), milestone_id: selectedMilestone }); }}
                disabled={postMutation.isPending || !postContent.trim()}
                className="bg-accent rounded-xl px-4 py-2 items-center justify-center"
              >
                <Text className="text-white text-sm font-medium">{postMutation.isPending ? '…' : 'Post'}</Text>
              </TouchableOpacity>
            </View>}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

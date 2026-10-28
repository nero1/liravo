import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, FlatList, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image } from 'expo-image';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';

interface UserProfile {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

interface ChainNode {
  id: string;
  user_id: string;
  nominee_id: string | null;
  note: string | null;
  position: number;
  reader: UserProfile | null;
}

interface Chain {
  id: string;
  books: { id: string; title: string; author_name: string; cover_url: string | null } | null;
  nodes: ChainNode[];
}

interface BookPass {
  id: string;
  book_id: string;
  message: string | null;
  created_at: string;
}

export default function PassTheBookScreen() {
  const {t:ui}=useTranslations('');
  const qc = useQueryClient();
  const [tab, setTab] = useState<'chains' | 'passes'>('chains');
  const [nominateChainId, setNominateChainId] = useState<string | null>(null);
  const [nomineeId, setNomineeId] = useState('');
  const [nomineeNote, setNomineeNote] = useState('');
  const [startBookId, setStartBookId] = useState('');
  const [startNote, setStartNote] = useState('');
  const [showStartForm, setShowStartForm] = useState(false);

  const { data: chainsData, isLoading: chainsLoading } = useQuery({
    queryKey: ['pass-the-book-chains'],
    queryFn: () => api.get<{ chains: Chain[] }>('/api/pass-the-book/chains'),
  });

  const { data: passesData, isLoading: passesLoading } = useQuery({
    queryKey: ['pass-the-book-passes'],
    queryFn: () => api.get<{ received: BookPass[]; sent: BookPass[] }>('/api/pass-the-book'),
  });

  const startChainMutation = useMutation({
    mutationFn: (data: { book_id: string; note?: string }) =>
      api.post('/api/pass-the-book/chains', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pass-the-book-chains'] });
      setStartBookId('');
      setStartNote('');
      setShowStartForm(false);
      Alert.alert('Chain started!');
    },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  const nominateMutation = useMutation({
    mutationFn: ({ chainId, nomineeId, note }: { chainId: string; nomineeId: string; note?: string }) =>
      api.post(`/api/pass-the-book/chains/${chainId}/nominate`, { nominee_id: nomineeId, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pass-the-book-chains'] });
      setNominateChainId(null);
      setNomineeId('');
      setNomineeNote('');
      Alert.alert('Book passed!');
    },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  const chains = chainsData?.chains ?? [];
  const passes = passesData ?? { received: [], sent: [] };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-foreground">{ui('passTheBook.title')}</Text>
        {tab === 'chains' && (
          <TouchableOpacity onPress={() => setShowStartForm(!showStartForm)} className="bg-accent rounded-lg px-3 py-2">
            <Text className="text-white text-sm font-medium">+ Start</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab bar */}
      <View className="flex-row gap-1 mx-4 mb-2 border border-border rounded-lg p-1">
        {(['chains', 'passes'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            className={`flex-1 py-2 rounded-md items-center ${tab === t ? 'bg-accent' : ''}`}
          >
            <Text className={`text-sm font-medium ${tab === t ? 'text-white' : 'text-muted-foreground'}`}>
              {t === 'chains' ? 'Chains' : 'Direct'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Start chain form */}
      {tab === 'chains' && showStartForm && (
        <View className="mx-4 mb-3 border border-dashed border-border rounded-xl p-4 gap-3">
          <Text className="font-semibold text-sm text-foreground">Start a New Chain</Text>
          <TextInput
            value={startBookId}
            onChangeText={setStartBookId}
            placeholder="Book ID (UUID)…"
            placeholderTextColor="#9ca3af"
            className="border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background"
          />
          <TextInput
            value={startNote}
            onChangeText={setStartNote}
            placeholder="Why start this chain? (optional)"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={2}
            maxLength={500}
            className="border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background"
          />
          <View className="flex-row gap-2">
            <TouchableOpacity onPress={() => setShowStartForm(false)} className="flex-1 border border-border rounded-lg py-2 items-center">
              <Text className="text-sm text-muted-foreground">{ui('profile.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (startBookId.trim()) startChainMutation.mutate({ book_id: startBookId.trim(), note: startNote || undefined }); }}
              disabled={startChainMutation.isPending || !startBookId.trim()}
              className="flex-1 bg-accent rounded-lg py-2 items-center"
            >
              <Text className="text-sm text-white font-medium">{startChainMutation.isPending ? 'Starting…' : 'Start Chain'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Nominate form */}
      {nominateChainId && (
        <View className="mx-4 mb-3 border border-accent/40 bg-accent/5 rounded-xl p-4 gap-3">
          <Text className="font-semibold text-sm text-foreground">Pass to the next reader</Text>
          <TextInput
            value={nomineeId}
            onChangeText={setNomineeId}
            placeholder="Nominee User ID (UUID)…"
            placeholderTextColor="#9ca3af"
            className="border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background"
          />
          <TextInput
            value={nomineeNote}
            onChangeText={setNomineeNote}
            placeholder="Note (optional)"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={2}
            maxLength={500}
            className="border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background"
          />
          <View className="flex-row gap-2">
            <TouchableOpacity onPress={() => setNominateChainId(null)} className="flex-1 border border-border rounded-lg py-2 items-center">
              <Text className="text-sm text-muted-foreground">{ui('profile.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (nomineeId.trim()) nominateMutation.mutate({ chainId: nominateChainId, nomineeId: nomineeId.trim(), note: nomineeNote || undefined }); }}
              disabled={nominateMutation.isPending || !nomineeId.trim()}
              className="flex-1 bg-accent rounded-lg py-2 items-center"
            >
              <Text className="text-sm text-white font-medium">{nominateMutation.isPending ? 'Passing…' : 'Pass the Book'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {tab === 'chains' && (
        chainsLoading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#d97706" /></View>
        ) : (
          <FlatList
            data={chains}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
            renderItem={({ item: chain }) => {
              const sortedNodes = [...chain.nodes].sort((a, b) => a.position - b.position);
              return (
                <View className="rounded-xl border border-border bg-card p-4 gap-3">
                  <View className="flex-row gap-3">
                    {chain.books?.cover_url ? (
                      <Image source={{ uri: chain.books.cover_url }} style={{ width: 48, height: 72, borderRadius: 4 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 48, height: 72 }} className="rounded bg-muted" />
                    )}
                    <View className="flex-1">
                      <Text className="font-semibold text-foreground text-sm" numberOfLines={2}>{chain.books?.title ?? 'Unknown'}</Text>
                      <Text className="text-xs text-muted-foreground">{chain.books?.author_name}</Text>
                      <Text className="text-xs text-muted-foreground mt-1">{sortedNodes.length}{ui('onboarding.userType.reader')}{sortedNodes.length !== 1 ? 's' : ''}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setNominateChainId(chain.id)}
                      className="bg-accent/10 rounded-lg px-2 py-1 self-start"
                    >
                      <Text className="text-accent text-xs font-medium">{ui('passTheBook.passNext')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Chain reader avatars */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row items-center gap-1">
                      {sortedNodes.map((node, i) => (
                        <View key={node.id} className="flex-row items-center gap-1">
                          <View className="items-center gap-1">
                            <Avatar uri={node.reader?.avatar_url ?? null} name={node.reader?.display_name ?? '?'} size={32} />
                            <Text className="text-[9px] text-muted-foreground max-w-[48px] text-center" numberOfLines={1}>
                              {node.reader?.display_name ?? '?'}
                            </Text>
                          </View>
                          {i < sortedNodes.length - 1 && <Text className="text-muted-foreground text-sm">→</Text>}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="items-center py-12">
                <Text className="text-muted-foreground text-base">No chains yet</Text>
                <Text className="text-muted-foreground text-sm mt-1">Start one with a book you loved!</Text>
              </View>
            }
          />
        )
      )}

      {tab === 'passes' && (
        passesLoading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#d97706" /></View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 16 }}>
            <Text className="font-semibold text-foreground">Received ({passes.received.length})</Text>
            {passes.received.length === 0 ? (
              <Text className="text-muted-foreground text-sm">No books passed to you yet.</Text>
            ) : passes.received.map((p) => (
              <View key={p.id} className="p-3 rounded-lg border border-border gap-1">
                <Text className="text-accent text-sm font-medium">Book ID: {p.book_id.slice(0, 8)}…</Text>
                {p.message && <Text className="text-sm text-muted-foreground italic">&ldquo;{p.message}&rdquo;</Text>}
                <Text className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</Text>
              </View>
            ))}
            <Text className="font-semibold text-foreground mt-2">Sent ({passes.sent.length})</Text>
            {passes.sent.length === 0 ? (
              <Text className="text-muted-foreground text-sm">You haven't passed any books yet.</Text>
            ) : passes.sent.map((p) => (
              <View key={p.id} className="p-3 rounded-lg border border-border gap-1">
                <Text className="text-accent text-sm font-medium">Book ID: {p.book_id.slice(0, 8)}…</Text>
                {p.message && <Text className="text-sm text-muted-foreground italic">&ldquo;{p.message}&rdquo;</Text>}
                <Text className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</Text>
              </View>
            ))}
          </ScrollView>
        )
      )}
    </SafeAreaView>
  );
}

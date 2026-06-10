import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { FollowButton } from '@/components/social/FollowButton';
import { useAuthStore } from '@/stores/auth';

interface QAItem { id: string; question: string; answer: string | null; answered_at: string | null; }
interface AuthorPost { id: string; title: string; body: string; type: string; created_at: string; }

export default function AuthorProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [askQuestion, setAskQuestion] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const [askSending, setAskSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['author', username],
    queryFn: () => api.get<{
      author: { id: string; display_name: string; username: string; avatar_url: string | null; bio: string | null; is_verified_author: boolean; is_following?: boolean };
      posts: AuthorPost[];
      qa?: QAItem[];
    }>(ENDPOINTS.author.byUsername(username!)),
    enabled: !!username,
  });

  const { data: qaData } = useQuery({
    queryKey: ['author-qa', data?.author?.id],
    queryFn: () => api.get<{ qa: QAItem[] }>(`/api/author/qa?author_id=${data?.author?.id}`),
    enabled: !!data?.author?.id,
  });

  const author = data?.author;
  const posts = data?.posts ?? [];
  const qa = qaData?.qa ?? [];

  async function handleAsk() {
    if (!author || askQuestion.trim().length < 10) return;
    setAskSending(true);
    try {
      await api.post('/api/author/qa', { author_id: author.id, question: askQuestion.trim() });
      setAskQuestion('');
      setAskOpen(false);
      Alert.alert('Question submitted!', 'The author will be notified.');
    } catch {
      Alert.alert('Error', 'Could not submit question. Please try again.');
    }
    setAskSending(false);
  }

  if (isLoading || !author) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#d97706" />
      </View>
    );
  }

  const isOwn = currentUser?.username === username;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Header */}
        <View className="flex-row items-start gap-4">
          <Avatar uri={author.avatar_url} name={author.display_name} size={72} />
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="text-xl font-bold text-foreground">{author.display_name}</Text>
              {author.is_verified_author && <Badge variant="accent">✓ Verified Author</Badge>}
            </View>
            <Text className="text-muted-foreground text-sm">@{author.username}</Text>
          </View>
        </View>

        {author.bio && <Text className="text-foreground text-sm">{author.bio}</Text>}

        {/* Actions */}
        {!isOwn && (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <FollowButton userId={author.id} isFollowing={author.is_following ?? false} />
            </View>
            <TouchableOpacity
              onPress={() => setAskOpen(true)}
              className="flex-1 border border-border rounded-xl py-2 items-center justify-center"
            >
              <Text className="text-foreground text-sm font-medium">Ask</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Ask form */}
        {askOpen && (
          <Card>
            <Text className="font-semibold text-foreground mb-2">Ask a question</Text>
            <TextInput
              value={askQuestion}
              onChangeText={setAskQuestion}
              placeholder="What inspired you to write…?"
              multiline
              numberOfLines={3}
              maxLength={500}
              className="border border-border rounded-lg p-2 text-sm text-foreground bg-background mb-2"
              placeholderTextColor="#9ca3af"
            />
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setAskOpen(false)}
                className="flex-1 border border-border rounded-lg py-2 items-center"
              >
                <Text className="text-muted-foreground text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAsk}
                disabled={askSending || askQuestion.trim().length < 10}
                className="flex-1 bg-accent rounded-lg py-2 items-center opacity-90"
              >
                <Text className="text-white text-sm font-semibold">
                  {askSending ? 'Sending…' : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* From the Author posts */}
        {posts.length > 0 && (
          <View className="gap-3">
            <Text className="text-lg font-bold text-foreground">From the Author</Text>
            {posts.slice(0, 3).map((post) => (
              <Card key={post.id}>
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-xs font-medium text-accent uppercase">{post.type}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {new Date(post.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text className="font-semibold text-foreground mb-1">{post.title}</Text>
                <Text className="text-sm text-muted-foreground" numberOfLines={2}>{post.body}</Text>
              </Card>
            ))}
          </View>
        )}

        {/* Q&A */}
        {qa.length > 0 && (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-foreground">Q&A</Text>
              {!isOwn && (
                <TouchableOpacity onPress={() => setAskOpen(true)}>
                  <Text className="text-sm text-accent">Ask a question →</Text>
                </TouchableOpacity>
              )}
            </View>
            {qa.map((item) => (
              <Card key={item.id}>
                <Text className="font-semibold text-foreground text-sm mb-2">{item.question}</Text>
                {item.answer && (
                  <Text className="text-sm text-muted-foreground">{item.answer}</Text>
                )}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

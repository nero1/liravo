import {QueryError} from '@/components/ui/EmptyState';
import {Button} from '@/components/ui/Button';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams,useRouter } from 'expo-router';
import { useQuery,useInfiniteQuery } from '@tanstack/react-query';
import { useState,useEffect } from 'react';
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
  const {t:ui,locale}=useTranslations(''),router=useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user: currentUser } = useAuthStore(),intent=useRequestIntent(currentUser?.id);

  const [askQuestion, setAskQuestion] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const [askSending, setAskSending] = useState(false);
  useEffect(()=>{setAskQuestion('');setAskOpen(false);setAskSending(false);},[currentUser?.id]);

  const authorQuery = useInfiniteQuery({
    queryKey: ['author', username,currentUser?.id],
    initialPageParam:null as string|null,
    queryFn: ({pageParam}) => api.get<{
      author: { id: string; display_name: string; username: string; avatar_url: string | null; bio: string | null; is_verified_author: boolean; is_following?: boolean };
      posts: AuthorPost[];
      followerCount:number;books:{id:string;title:string;author_name:string}[];nextCursor:string|null;
      qa?: QAItem[];
    }>(ENDPOINTS.author.byUsername(username!),pageParam?{cursor:pageParam}:undefined),
    getNextPageParam:page=>page.nextCursor,
    enabled: !!username,
  });

  const data=authorQuery.data?.pages[0],isLoading=authorQuery.isLoading;
  const { data: qaData,error:qaError,refetch:retryQa } = useQuery({
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
      const body={author_id:author.id,question:askQuestion.trim()},scope='author.qa.'+author.id,result=await api.post<{qa:{id:string;asked_by:string}}>('/api/author/qa',body,await intent.durableHeaders(body,scope));
      if(!result.qa?.id||result.qa.asked_by!==currentUser?.id)throw Error('Invalid author question receipt');
      await intent.complete(scope);
      if(useAuthStore.getState().user?.id!==currentUser?.id)return;
      setAskQuestion('');
      setAskOpen(false);
      Alert.alert(ui('authorQA.questionSubmitted'));
    } catch {
      Alert.alert(ui('common.error'),ui('authorCatalog.saveFailed'));
    }finally{setAskSending(false);}
  }

  if(authorQuery.error)return <QueryError error={authorQuery.error} retry={()=>void authorQuery.refetch()}/>;
  if (isLoading || !author) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel={ui('common.loading')} color="#d97706" />
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
              {author.is_verified_author && <Badge variant="accent">{ui('authorProfile.verified')}</Badge>}
            </View>
            <Text className="text-muted-foreground text-sm">@{author.username}</Text>
            <Text className="text-muted-foreground text-sm">{ui('authorProfile.followers',{count:data?.followerCount??0})}</Text>
          </View>
        </View>

        {author.bio && <Text className="text-foreground text-sm">{author.bio}</Text>}

        {/* Actions */}
        {currentUser&&!isOwn && (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <FollowButton userId={author.id} isFollowing={author.is_following ?? false} />
            </View>
            <TouchableOpacity
              accessibilityRole="button" onPress={() => setAskOpen(true)}
              className="flex-1 border border-border rounded-xl py-2 items-center justify-center"
            >
              <Text className="text-foreground text-sm font-medium">{ui('authorQA.ask')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Ask form */}
        {askOpen && (
          <Card>
            <Text className="font-semibold text-foreground mb-2">{ui('authorQA.askQuestion')}</Text>
            <TextInput
              accessibilityLabel={ui('authorQA.askQuestion')} editable={!askSending} value={askQuestion}
              onChangeText={setAskQuestion}
              placeholder={ui('authorQA.questionPlaceholder')}
              multiline
              numberOfLines={3}
              maxLength={500}
              className="border border-border rounded-lg p-2 text-sm text-foreground bg-background mb-2"
              placeholderTextColor="#9ca3af"
            />
            <View className="flex-row gap-2">
              <TouchableOpacity
                accessibilityRole="button" disabled={askSending} onPress={() => setAskOpen(false)}
                className="flex-1 border border-border rounded-lg py-2 items-center"
              >
                <Text className="text-muted-foreground text-sm">{ui('profile.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button" onPress={handleAsk}
                disabled={askSending || askQuestion.trim().length < 10}
                className="flex-1 bg-accent rounded-lg py-2 items-center opacity-90"
              >
                <Text className="text-white text-sm font-semibold">
                  {askSending?ui('common.saving'):ui('authorQA.submitQuestion')}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        <View className="gap-3"><Text className="text-lg font-bold text-foreground">{ui('authorProfile.books')}</Text>{authorQuery.data?.pages.flatMap(page=>page.books).map(book=><TouchableOpacity key={book.id} accessibilityRole="link" onPress={()=>router.push('/book/'+book.id)} className="rounded-xl border border-border p-3"><Text className="font-medium text-foreground">{book.title}</Text><Text className="text-xs text-muted-foreground">{book.author_name}</Text></TouchableOpacity>)}{authorQuery.hasNextPage&&<Button loading={authorQuery.isFetchingNextPage} onPress={()=>void authorQuery.fetchNextPage()}>{ui('common.loadMore')}</Button>}</View>

        {/* From the Author posts */}
        {posts.length > 0 && (
          <View className="gap-3">
            <Text className="text-lg font-bold text-foreground">{ui('authorProfile.posts')}</Text>
            {posts.map((post) => (
              <Card key={post.id}>
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-xs font-medium text-accent uppercase">{ui(`authorCatalog.${post.type}`)}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {new Date(post.created_at).toLocaleDateString(locale,{timeZone:'UTC'})}
                  </Text>
                </View>
                <Text className="font-semibold text-foreground mb-1">{post.title}</Text>
                <Text className="text-sm text-muted-foreground" numberOfLines={2}>{post.body}</Text>
              </Card>
            ))}
          </View>
        )}

        {qaError&&<QueryError error={qaError} retry={()=>void retryQa()}/>}
        {/* Q&A */}
        {qa.length > 0 && (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-foreground">{ui('authorProfile.qa')}</Text>
              {!isOwn && (
                <TouchableOpacity accessibilityRole="button" onPress={() => setAskOpen(true)}>
                  <Text className="text-sm text-accent">{ui('authorProfile.askQuestion')}</Text>
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

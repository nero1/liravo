import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { FollowButton } from '@/components/social/FollowButton';
import { useAuthStore } from '@/stores/auth';

export default function AuthorProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user: currentUser } = useAuthStore();
  const { data, isLoading } = useQuery({ queryKey: ['author', username], queryFn: () => api.get<{ author: any }>(ENDPOINTS.author.byUsername(username!)), enabled: !!username });
  const author = data?.author;
  if (isLoading || !author) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View className="flex-row items-center gap-4">
          <Avatar uri={author.avatar_url} name={author.display_name} size={72} />
          <View className="flex-1 gap-1">
            <Text className="text-xl font-bold text-foreground">{author.display_name}</Text>
            <Text className="text-muted-foreground">@{author.username}</Text>
            <Badge variant="accent">✓ Verified Author</Badge>
          </View>
        </View>
        {currentUser?.username !== username && <FollowButton userId={author.id} isFollowing={author.is_following ?? false} />}
        {author.bio && <Text className="text-foreground">{author.bio}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

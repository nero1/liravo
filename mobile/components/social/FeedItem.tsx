import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/books/StarRating';
import type { FeedItem as FeedItemType } from '@/types';

interface Props {
  item: FeedItemType;
}

export function FeedItem({ item }: Props) {
  const router = useRouter();

  const action = {
    review: 'reviewed',
    shelf_add: 'added to shelf',
    challenge_join: 'joined a challenge',
    quote: 'quoted from',
    follow: 'started following',
  }[item.type] ?? 'updated';

  return (
    <View className="bg-card border border-border rounded-xl p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <TouchableOpacity onPress={() => router.push(`/user/${item.actor.username}`)}>
          <Avatar uri={item.actor.avatar_url} name={item.actor.display_name} size={36} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-foreground">
            <Text
              className="font-semibold"
              onPress={() => router.push(`/user/${item.actor.username}`)}
            >
              {item.actor.display_name}
            </Text>
            {' '}{action}
            {item.book && (
              <>
                {' '}
                <Text
                  className="font-medium text-accent"
                  onPress={() => router.push(`/book/${item.book!.id}`)}
                >
                  {item.book.title}
                </Text>
              </>
            )}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </Text>
        </View>
      </View>

      {item.book && (
        <TouchableOpacity
          className="flex-row gap-3"
          onPress={() => router.push(`/book/${item.book!.id}`)}
          activeOpacity={0.7}
        >
          {item.book.cover_url && (
            <Image
              source={{ uri: item.book.cover_url }}
              style={{ width: 48, height: 72, borderRadius: 4 }}
              contentFit="cover"
            />
          )}
          <View className="flex-1 justify-center gap-1">
            <Text className="font-semibold text-foreground" numberOfLines={2}>{item.book.title}</Text>
            <Text className="text-sm text-muted-foreground">{item.book.author_name}</Text>
          </View>
        </TouchableOpacity>
      )}

      {item.review && (
        <View className="gap-1.5">
          <StarRating value={item.review.rating} size={16} readonly />
          {item.review.content && (
            <Text className="text-sm text-foreground" numberOfLines={3}>{item.review.content}</Text>
          )}
        </View>
      )}

      {item.quote && (
        <View className="bg-muted rounded-lg p-3">
          <Text className="text-sm text-foreground italic" numberOfLines={4}>
            "{item.quote.content}"
          </Text>
          {item.quote.page_number && (
            <Text className="text-xs text-muted-foreground mt-1">p. {item.quote.page_number}</Text>
          )}
        </View>
      )}
    </View>
  );
}

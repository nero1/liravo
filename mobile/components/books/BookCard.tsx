import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Star } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import type { BookRow } from '@/types';

interface Props {
  book: BookRow;
  compact?: boolean;
}

export function BookCard({ book, compact }: Props) {
  const router = useRouter();

  if (compact) {
    return (
      <TouchableOpacity
        className="flex-row gap-3 items-center"
        onPress={() => router.push(`/book/${book.id}`)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: book.cover_url ?? undefined }}
          style={{ width: 48, height: 72, borderRadius: 4 }}
          contentFit="cover"
          className="bg-muted"
        />
        <View className="flex-1 gap-0.5">
          <Text className="font-semibold text-foreground" numberOfLines={2}>{book.title}</Text>
          <Text className="text-sm text-muted-foreground">{book.author_name}</Text>
          {book.average_rating && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Star size={12} color="#d97706" fill="#d97706" />
              <Text className="text-xs text-muted-foreground">{book.average_rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      className="w-32 gap-2"
      onPress={() => router.push(`/book/${book.id}`)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: book.cover_url ?? undefined }}
        style={{ width: 128, height: 192, borderRadius: 8 }}
        contentFit="cover"
        className="bg-muted"
      />
      <View className="gap-0.5">
        <Text className="font-semibold text-foreground text-sm" numberOfLines={2}>{book.title}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>{book.author_name}</Text>
        {book.average_rating && (
          <View className="flex-row items-center gap-1">
            <Star size={11} color="#d97706" fill="#d97706" />
            <Text className="text-xs text-muted-foreground">{book.average_rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

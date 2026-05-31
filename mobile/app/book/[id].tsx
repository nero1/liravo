import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { BookOpen, MessageSquare, Quote } from 'lucide-react-native';
import { useBook, useBookReviews } from '@/hooks/useBooks';
import { StarRating } from '@/components/books/StarRating';
import { AffiliateLinkButtons } from '@/components/books/AffiliateLinkButtons';
import { AddToShelfModal } from '@/components/shelf/AddToShelfModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [shelfModalOpen, setShelfModalOpen] = useState(false);
  const { data: bookData, isLoading } = useBook(id!);
  const { data: reviewData } = useBookReviews(id!);

  const book = bookData?.book;
  const reviews = reviewData?.reviews ?? [];

  if (isLoading || !book) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#d97706" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero */}
        <View className="items-center px-6 py-6 gap-4 bg-muted">
          <Image
            source={{ uri: book.cover_url ?? undefined }}
            style={{ width: 140, height: 210, borderRadius: 8 }}
            contentFit="cover"
            className="shadow-lg"
          />
          <View className="items-center gap-1">
            <Text className="text-2xl font-bold text-foreground text-center">{book.title}</Text>
            {book.subtitle && (
              <Text className="text-muted-foreground text-center">{book.subtitle}</Text>
            )}
            <Text className="text-foreground">{book.author_names.join(', ')}</Text>
            {book.average_rating && (
              <View className="flex-row items-center gap-2">
                <StarRating value={Math.round(book.average_rating)} size={18} readonly />
                <Text className="text-muted-foreground text-sm">
                  {book.average_rating.toFixed(1)} ({book.ratings_count.toLocaleString()})
                </Text>
              </View>
            )}
          </View>
        </View>

        <View className="px-4 gap-5 mt-4">
          {/* Shelf CTA */}
          <Button onPress={() => setShelfModalOpen(true)} size="lg">
            Add to Shelf
          </Button>

          {/* Action row */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 border border-border rounded-xl py-3 items-center flex-row justify-center gap-2"
              onPress={() => router.push({ pathname: '/review/new', params: { bookId: id } })}
              activeOpacity={0.7}
            >
              <MessageSquare size={16} color="#6b7280" />
              <Text className="text-foreground font-medium">Review</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 border border-border rounded-xl py-3 items-center flex-row justify-center gap-2"
              onPress={() => router.push({ pathname: '/quote/new', params: { bookId: id, bookTitle: book.title } })}
              activeOpacity={0.7}
            >
              <Quote size={16} color="#6b7280" />
              <Text className="text-foreground font-medium">Quote</Text>
            </TouchableOpacity>
          </View>

          {/* Genres */}
          {book.genres.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {book.genres.slice(0, 5).map((g) => (
                <Badge key={g}>{g}</Badge>
              ))}
            </View>
          )}

          {/* Meta */}
          <View className="flex-row flex-wrap gap-x-6 gap-y-1">
            {book.published_year && (
              <Text className="text-sm text-muted-foreground">Published: {book.published_year}</Text>
            )}
            {book.page_count && (
              <Text className="text-sm text-muted-foreground">{book.page_count} pages</Text>
            )}
            {book.publisher && (
              <Text className="text-sm text-muted-foreground">{book.publisher}</Text>
            )}
          </View>

          {/* Reading stats */}
          <View className="flex-row gap-4 bg-muted p-3 rounded-xl">
            {[
              { label: 'Reading', value: book.currently_reading_count },
              { label: 'Want to Read', value: book.want_to_read_count },
              { label: 'Have Read', value: book.have_read_count },
            ].map(({ label, value }) => (
              <View key={label} className="flex-1 items-center">
                <Text className="font-bold text-foreground">{value.toLocaleString()}</Text>
                <Text className="text-xs text-muted-foreground text-center">{label}</Text>
              </View>
            ))}
          </View>

          {/* Description */}
          {book.description && (
            <View className="gap-2">
              <Text className="font-semibold text-foreground">About this book</Text>
              <Text className="text-foreground leading-relaxed">{book.description}</Text>
            </View>
          )}

          {/* Affiliate links */}
          <AffiliateLinkButtons book={book} />

          {/* Reviews */}
          {reviews.length > 0 && (
            <View className="gap-3">
              <Text className="font-semibold text-foreground">Reviews ({reviews.length})</Text>
              {reviews.slice(0, 3).map((review) => (
                <View key={review.id} className="bg-card border border-border rounded-xl p-3 gap-2">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-medium text-foreground text-sm">{review.user?.display_name ?? 'Reader'}</Text>
                    <StarRating value={review.rating} size={14} readonly />
                  </View>
                  {review.content && (
                    <Text className="text-sm text-foreground" numberOfLines={4}>{review.content}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <AddToShelfModal book={book} visible={shelfModalOpen} onClose={() => setShelfModalOpen(false)} />
    </SafeAreaView>
  );
}

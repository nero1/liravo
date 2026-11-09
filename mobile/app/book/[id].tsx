import {useTranslations} from '@/hooks/useTranslations';
import {EditionSelector} from '@/components/books/EditionSelector';
import { QueryError } from '@/components/ui/EmptyState';
import {useState,useEffect} from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { MessageSquare, Quote } from 'lucide-react-native';
import { useBook, useBookReviews } from '@/hooks/useBooks';
import { StarRating } from '@/components/books/StarRating';
import { AffiliateLinkButtons } from '@/components/books/AffiliateLinkButtons';
import { AddToShelfModal } from '@/components/shelf/AddToShelfModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {ReviewWantToReadButton} from '@/components/books/ReviewWantToReadButton';
import {useAuthStore} from '@/stores/auth';

export default function BookDetailScreen() {
  const genres=useTranslations('aiProfiles');
  const {t:debateText}=useTranslations('bookDebates');
  const { id } = useLocalSearchParams<{ id: string }>();
  const router=useRouter(),{t,locale}=useTranslations('book'),{t:books}=useTranslations('books'),{t:common}=useTranslations('common');
  const owner=useAuthStore(state=>state.user?.id);
  const [shelfModalOpen, setShelfModalOpen] = useState(false);
  const { data: bookData, isLoading,error,refetch } = useBook(id!);
  const {t:history}=useTranslations('readingHistory');
  const reviewQuery=useBookReviews(bookData?.book.id??id!);

  const book = bookData?.book;
  const reviews=reviewQuery.data?.pages.flatMap(page=>page.reviews)??[],statistics=reviewQuery.data?.pages[0]?.statistics;
  useEffect(()=>{if(book&&book.id!==id)router.replace('/book/'+book.id);},[book,id,router]);

  if(error)return <QueryError error={error} retry={()=>void refetch()} />;

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
            <Text className="text-foreground">{book.author_names.length?book.author_names.join(', '):book.author_name}</Text>
            {book.average_rating!==null && (
              <View className="flex-row items-center gap-2">
                <StarRating value={Math.round(book.average_rating)} size={18} readonly />
                <Text className="text-muted-foreground text-sm">
                  {book.average_rating.toLocaleString(locale,{maximumFractionDigits:1})} ({book.ratings_count.toLocaleString(locale)}) · {t('catalogRating')}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View className="px-4 gap-5 mt-4">
          {/* Shelf CTA */}
          <Button onPress={() => setShelfModalOpen(true)} size="lg">
            {books('addToShelf')}
          </Button>

          {/* Action row */}
          <View className="flex-row gap-3">
            <TouchableOpacity accessibilityRole="link"
              className="flex-1 border border-border rounded-xl py-3 items-center flex-row justify-center gap-2"
              onPress={() => router.push({ pathname: '/review/new', params: { bookId: book.id } })}
              activeOpacity={0.7}
            >
              <MessageSquare size={16} color="#6b7280" />
              <Text className="text-foreground font-medium">{t('review')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="link"
              className="flex-1 border border-border rounded-xl py-3 items-center flex-row justify-center gap-2"
              onPress={() => router.push({ pathname: '/quote/new', params: { bookId: book.id, bookTitle: book.title } })}
              activeOpacity={0.7}
            >
              <Quote size={16} color="#6b7280" />
              <Text className="text-foreground font-medium">{t('quote')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity accessibilityRole="link" onPress={()=>router.push({pathname:'/debates/new',params:{bookId:book.id}})} className="rounded-lg border border-border px-4 py-3"><Text className="text-accent">{debateText('create')}</Text></TouchableOpacity>

          {/* Genres */}
          {book.genres.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {book.genres.slice(0, 5).map((g) => (
                <Badge key={g}>{genres.has('genreLabels.'+g)?genres.t('genreLabels.'+g):g}</Badge>
              ))}
            </View>
          )}

          {/* Meta */}
          <View className="flex-row flex-wrap gap-x-6 gap-y-1">
            {book.published_year && (
              <Text className="text-sm text-muted-foreground">{t('publishedYear',{year:book.published_year})}</Text>
            )}
            {book.page_count && (
              <Text className="text-sm text-muted-foreground">{t('pageCount',{count:book.page_count})}</Text>
            )}
            {book.publisher && (
              <Text className="text-sm text-muted-foreground">{book.publisher}</Text>
            )}
          </View>

          {/* Reading stats */}
          <View className="flex-row gap-4 bg-muted p-3 rounded-xl">
            {[
              { label: books('currentlyReading'), value: book.currently_reading_count },
              { label: books('wantToRead'), value: book.want_to_read_count },
              { label: books('haveRead'), value: book.have_read_count },
            ].map(({ label, value }) => (
              <View key={label} className="flex-1 items-center">
                <Text className="font-bold text-foreground">{value.toLocaleString(locale)}</Text>
                <Text className="text-xs text-muted-foreground text-center">{label}</Text>
              </View>
            ))}
          </View>

          {/* Description */}
          {book.description && (
            <View className="gap-2">
              <Text className="font-semibold text-foreground">{t('about')}</Text>
              <Text className="text-foreground leading-relaxed">{book.description}</Text>
            </View>
          )}

          {bookData?.authors?.map(author=><TouchableOpacity key={author.id} accessibilityRole="link" onPress={()=>router.push('/author/'+author.username)} className="rounded-xl border border-border p-3"><Text className="font-medium text-foreground">{t('authorOnLiravo',{author:author.display_name})}</Text><Text className="text-xs text-muted-foreground">{t('verifiedAuthor')}</Text></TouchableOpacity>)}
          {bookData&&<EditionSelector catalog={bookData} book={book}/>}

          {/* Affiliate links */}
          <AffiliateLinkButtons book={book} links={[...(bookData?.affiliateLinks??[]),...(bookData?.audibleLink?[bookData.audibleLink]:[])]} />

          <Button variant="outline" onPress={()=>router.push('/reading-sessions?book_id='+book.id)}>{history('title')}</Button>
          {/* Reviews */}
          {statistics&&statistics.ratings_count>0&&<Text className="text-foreground">{t('communityRatings',{count:statistics.ratings_count})} · {statistics.average_rating?.toLocaleString(locale,{maximumFractionDigits:2})}/5</Text>}
          {reviewQuery.isLoading&&<ActivityIndicator accessibilityLabel={common('loading')} color="#d97706"/>}
          {reviewQuery.error&&!reviewQuery.isFetchNextPageError&&<QueryError error={reviewQuery.error} retry={()=>void reviewQuery.refetch()}/>}
          {reviews.length > 0 && (
            <View className="gap-3">
              <Text className="font-semibold text-foreground">{t('reviewCount',{count:statistics?.ratings_count??reviews.length})}</Text>
              {reviews.map((review) => (
                <View key={review.id} className="bg-card border border-border rounded-xl p-3 gap-2">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-medium text-foreground text-sm">{review.user?.display_name??t('reader')}</Text>
                    <StarRating value={review.rating} size={14} readonly />
                  </View>
                  {review.content && (
                    <Text className="text-sm text-foreground" numberOfLines={4}>{review.content}</Text>
                  )}
                  {review.user_id!==owner&&<ReviewWantToReadButton key={owner} bookId={review.book_id??book.id} reviewId={review.id}/>}
                </View>
              ))}
            </View>
          )}
          {reviewQuery.hasNextPage&&<Button variant="outline" loading={reviewQuery.isFetchingNextPage} onPress={()=>void reviewQuery.fetchNextPage()}>{common(reviewQuery.isFetchNextPageError?'retry':'loadMore')}</Button>}
        </View>
      </ScrollView>

      <AddToShelfModal book={book} visible={shelfModalOpen} onClose={() => setShelfModalOpen(false)} />
    </SafeAreaView>
  );
}

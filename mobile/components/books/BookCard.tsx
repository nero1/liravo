import {useTranslations} from '@/hooks/useTranslations';
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
  const router=useRouter(),{t,locale}=useTranslations('editions');
  let language=book.language;try{if(language)language=new Intl.DisplayNames([locale],{type:'language'}).of(language)??language;}catch{}
  const details=[language,book.format?t('formats.'+book.format):null,book.edition_name,book.publisher,book.published_year].filter(Boolean).join(' · '),isbn=book.isbn_13??book.isbn_10;
  const accessibilityLabel=[book.title,book.author_name,details,isbn?t('isbn',{value:isbn}):null].filter(Boolean).join(', ');
  const parsedRating=book.average_rating==null?NaN:Number(book.average_rating);
  const rating=Number.isFinite(parsedRating)&&parsedRating>=0&&parsedRating<=5?parsedRating:null;

  if (compact) {
    return (
      <TouchableOpacity accessibilityRole="link" accessibilityLabel={accessibilityLabel}
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
          {details&&<Text className="text-xs text-muted-foreground" numberOfLines={2}>{details}</Text>}
          {isbn&&<Text className="text-xs text-muted-foreground">{t('isbn',{value:isbn})}</Text>}
          {rating!==null && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Star size={12} color="#d97706" fill="#d97706" />
              <Text className="text-xs text-muted-foreground">{rating.toLocaleString(locale,{maximumFractionDigits:1})}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity accessibilityRole="link" accessibilityLabel={accessibilityLabel}
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
        {rating!==null && (
          <View className="flex-row items-center gap-1">
            <Star size={11} color="#d97706" fill="#d97706" />
            <Text className="text-xs text-muted-foreground">{rating.toLocaleString(locale,{maximumFractionDigits:1})}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

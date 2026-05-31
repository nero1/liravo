import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ShoppingCart, Headphones } from 'lucide-react-native';
import { useTrackAffiliateClick } from '@/hooks/useBooks';
import type { BookRow } from '@/types';

interface Props {
  book: BookRow;
  affiliateTags?: Record<string, string>;
}

const AMAZON_STORES: { country: string; label: string; template: string }[] = [
  { country: 'US', label: 'Amazon US', template: 'https://www.amazon.com/s?k={title}&tag={tag}' },
  { country: 'UK', label: 'Amazon UK', template: 'https://www.amazon.co.uk/s?k={title}&tag={tag}' },
  { country: 'CA', label: 'Amazon CA', template: 'https://www.amazon.ca/s?k={title}&tag={tag}' },
  { country: 'AU', label: 'Amazon AU', template: 'https://www.amazon.com.au/s?k={title}&tag={tag}' },
];

export function AffiliateLinkButtons({ book, affiliateTags = {} }: Props) {
  const trackClick = useTrackAffiliateClick();

  async function openLink(country: string, template: string, tag: string) {
    const url = template
      .replace('{title}', encodeURIComponent(`${book.title} ${book.author_name}`))
      .replace('{tag}', tag || '');

    trackClick.mutate({ book_id: book.id, link_type: 'amazon', store_name: `amazon_${country.toLowerCase()}` });
    await WebBrowser.openBrowserAsync(url);
  }

  async function openAudible() {
    const url = `https://www.audible.com/search?keywords=${encodeURIComponent(book.title)}`;
    trackClick.mutate({ book_id: book.id, link_type: 'audible' });
    await WebBrowser.openBrowserAsync(url);
  }

  return (
    <View className="gap-3">
      <Text className="font-semibold text-foreground">Buy this book</Text>
      <View className="flex-row flex-wrap gap-2">
        {AMAZON_STORES.map(({ country, label, template }) => (
          <TouchableOpacity
            key={country}
            onPress={() => openLink(country, template, affiliateTags[country] ?? '')}
            className="bg-accent rounded-lg px-3 py-2 flex-row items-center gap-1.5"
            activeOpacity={0.7}
          >
            <ShoppingCart size={14} color="#fff" />
            <Text className="text-accent-foreground text-sm font-medium">{label}</Text>
          </TouchableOpacity>
        ))}
        {book.has_audiobook && (
          <TouchableOpacity
            onPress={openAudible}
            className="bg-primary rounded-lg px-3 py-2 flex-row items-center gap-1.5"
            activeOpacity={0.7}
          >
            <Headphones size={14} color="#fff" />
            <Text className="text-primary-foreground text-sm font-medium">Audible</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

import {useTranslations} from '@/hooks/useTranslations';
import { useState,useRef,useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, ArrowLeft } from 'lucide-react-native';
import { api } from '@/lib/api';

interface AiBook {
  title: string;
  author: string;
  reason: string;
}

export default function MoodAiScreen() {
  const router = useRouter(),{t}=useTranslations('discover'),{t:common}=useTranslations('common'),controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;},[]);
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<AiBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,setError]=useState(false);

  async function search() {
    if(controller.current||query.trim().length<3)return;
    const current=new AbortController();controller.current=current;
    setLoading(true);
    setError(false);
    setSearched(false);
    try {
      const data = await api.get<{ recommendations?: AiBook[] }>('/api/ai/recommendations', {
        mood: query.trim(),
      },current.signal);
      if(controller.current!==current||current.signal.aborted)return;
      setBooks(data.recommendations ?? []);
      setSearched(true);
    } catch {
      if(controller.current===current&&!current.signal.aborted)setError(true);
    } finally {
      if(controller.current===current){controller.current=null;setLoading(false);}
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={common('back')} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#d97706" />
        </TouchableOpacity>
        <View className="flex-row items-center gap-2 flex-1">
          <Sparkles size={20} color="#d97706" />
          <Text className="text-xl font-bold text-foreground">{t('aiTitle')}</Text>
        </View>
      </View>

      <View className="px-4 mb-4">
        <Text className="text-sm text-muted-foreground mb-3">
          {t('aiDescription')}
        </Text>
        <View className="flex-row gap-2">
          <TextInput
            value={query}
            onChangeText={value=>{controller.current?.abort();controller.current=null;setQuery(value);setBooks([]);setSearched(false);setError(false);setLoading(false);}}
            onSubmitEditing={search}
            accessibilityLabel={t('aiDescription')} placeholder={t('aiPlaceholder')}
            placeholderTextColor="#9ca3af"
            className="flex-1 bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-sm"
            returnKeyType="search"
            maxLength={80}
          />
          <TouchableOpacity
            onPress={search}
            disabled={loading || query.trim().length < 3}
            className="bg-accent rounded-xl px-4 py-3 items-center justify-center"
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-semibold text-sm">{t('find')}</Text>
            )}
          </TouchableOpacity>
        </View>
        {error && (
          <Text className="text-destructive text-sm mt-2">{t('aiFailed')}</Text>
        )}
      </View>

      {searched && books.length === 0 && !loading && (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-muted-foreground text-center">
            {t('aiEmpty')}
          </Text>
        </View>
      )}

      <FlatList
        data={books}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/discover?q=${encodeURIComponent(item.title)}`)}
            className="mx-4 mb-3 p-4 bg-card border border-border rounded-xl"
          >
            <Text className="font-semibold text-foreground" numberOfLines={2}>{item.title}</Text>
            <Text className="text-sm text-muted-foreground mt-0.5">{item.author}</Text>
            <Text className="text-xs text-muted-foreground mt-1 italic" numberOfLines={2}>
              {item.reason}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={loading ? (
          <View className="py-8 items-center">
            <ActivityIndicator color="#d97706" />
            <Text className="text-muted-foreground mt-2 text-sm">{t('aiLoading')}</Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

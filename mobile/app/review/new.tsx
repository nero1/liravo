import { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/books/StarRating';
import { MOOD_TAGS } from '@/types';

export default function NewReviewScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [hasSpoilers, setHasSpoilers] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api.post(ENDPOINTS.reviews.list, {
        book_id: bookId,
        rating,
        content,
        mood_tags: selectedMoods,
        has_spoilers: hasSpoilers,
        review_type: content.length > 200 ? 'long' : content.length > 0 ? 'short' : 'one_line',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId, 'reviews'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      router.back();
    },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  function toggleMood(mood: string) {
    setSelectedMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 20 }}>
          <View className="items-center gap-2">
            <Text className="font-semibold text-foreground">Your Rating</Text>
            <StarRating value={rating} onChange={setRating} size={36} />
          </View>

          <Input
            label="Review (optional)"
            value={content}
            onChangeText={setContent}
            placeholder="What did you think?"
            multiline
            numberOfLines={5}
            maxLength={5000}
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />

          <View className="gap-2">
            <Text className="font-medium text-foreground text-sm">Mood Tags</Text>
            <View className="flex-row flex-wrap gap-2">
              {MOOD_TAGS.map((mood) => {
                const selected = selectedMoods.includes(mood);
                return (
                  <TouchableOpacity
                    key={mood}
                    onPress={() => toggleMood(mood)}
                    className={`border rounded-full px-3 py-1.5 ${selected ? 'border-accent bg-accent' : 'border-border bg-card'}`}
                    activeOpacity={0.7}
                  >
                    <Text className={`text-sm ${selected ? 'text-accent-foreground' : 'text-foreground'}`}>{mood}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            className="flex-row items-center gap-2"
            onPress={() => setHasSpoilers(!hasSpoilers)}
            activeOpacity={0.7}
          >
            <View className={`w-5 h-5 rounded border-2 items-center justify-center ${hasSpoilers ? 'border-accent bg-accent' : 'border-border'}`}>
              {hasSpoilers && <Text className="text-accent-foreground text-xs">✓</Text>}
            </View>
            <Text className="text-foreground">Contains spoilers</Text>
          </TouchableOpacity>

          <Button
            onPress={() => submit.mutate()}
            loading={submit.isPending}
            disabled={rating === 0}
            size="lg"
          >
            Post Review
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

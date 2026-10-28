import {useTranslations} from '@/hooks/useTranslations';
import { useState } from 'react';
import { ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function NewQuoteScreen() {
  const {t:ui}=useTranslations('');
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [pageNumber, setPageNumber] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.post(ENDPOINTS.quotes, {
        book_id: bookId,
        content,
        page_number: pageNumber ? parseInt(pageNumber) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId, 'quotes'] });
      router.back();
    },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
          <Input
            label="Quote"
            value={content}
            onChangeText={setContent}
            placeholder="Enter the quote..."
            multiline
            numberOfLines={6}
            maxLength={1000}
            style={{ minHeight: 140, textAlignVertical: 'top' }}
          />
          <Input
            label="Page Number (optional)"
            value={pageNumber}
            onChangeText={setPageNumber}
            placeholder="e.g. 42"
            keyboardType="number-pad"
            maxLength={5}
          />
          <Button
            onPress={() => submit.mutate()}
            loading={submit.isPending}
            disabled={content.trim().length < 5}
            size="lg"
          >{ui('nativeNavigation.saveQuote')}</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

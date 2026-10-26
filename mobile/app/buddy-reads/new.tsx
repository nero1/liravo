import { View, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function NewBuddyReadScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [bookId, setBookId] = useState('');
  const create = useMutation({
    mutationFn: () => api.post(ENDPOINTS.buddyReads.create, { title, book_id: bookId, max_participants: 3, current_chapter: 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buddy-reads'] }); router.back(); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
          <Input label="Title" value={title} onChangeText={setTitle} placeholder="Give this buddy read a name" />
          <Input label="Book ID" value={bookId} onChangeText={setBookId} placeholder="Paste a book ID from Discover" />
          <Button onPress={() => create.mutate()} loading={create.isPending} disabled={!title.trim()} size="lg">Create</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

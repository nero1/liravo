import { View, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function NewAuthorPostScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const create = useMutation({
    mutationFn: () => api.post(ENDPOINTS.author.createPost, { title, content }),
    onSuccess: () => { router.back(); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
          <Input label="Post Title" value={title} onChangeText={setTitle} placeholder="e.g. New book announcement" maxLength={120} />
          <Input label="Content" value={content} onChangeText={setContent} placeholder="Share an update with your readers..." multiline numberOfLines={8} maxLength={5000} style={{ minHeight: 160, textAlignVertical: 'top' }} />
          <Button onPress={() => create.mutate()} loading={create.isPending} disabled={!title.trim() || !content.trim()} size="lg">Publish Post</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

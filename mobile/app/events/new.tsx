import { View, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function NewEventScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => api.post(ENDPOINTS.events.create, { title, description }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); router.back(); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        <Input label="Event Title" value={title} onChangeText={setTitle} placeholder="e.g. Summer Reading Challenge" />
        <Input label="Description" value={description} onChangeText={setDescription} placeholder="What is this event about?" multiline numberOfLines={4} style={{ textAlignVertical: 'top' }} />
        <Button onPress={() => create.mutate()} loading={create.isPending} disabled={!title.trim()} size="lg">Create Event</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

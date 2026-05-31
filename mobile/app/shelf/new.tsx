import { View, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useCreateShelf } from '@/hooks/useShelf';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function NewShelfScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateShelf();

  async function submit() {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1 px-4 pt-4 gap-4">
          <Input label="Shelf Name" value={name} onChangeText={setName} placeholder="e.g. Beach Reads" maxLength={60} />
          <Input label="Description (optional)" value={description} onChangeText={setDescription} placeholder="What goes on this shelf?" multiline numberOfLines={3} maxLength={200} style={{ textAlignVertical: 'top' }} />
          <Button onPress={submit} loading={create.isPending} disabled={!name.trim()} size="lg">Create Shelf</Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

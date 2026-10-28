import {useTranslations} from '@/hooks/useTranslations';
import { View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function NewReadingRoomScreen() {
  const {t:ui}=useTranslations('');
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api.post(ENDPOINTS.readingRooms.create, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reading-rooms'] }); router.back(); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 pt-4 gap-4">
        <Input label="Room Name" value={name} onChangeText={setName} placeholder="e.g. Sci-Fi Enthusiasts" />
        <Button onPress={() => create.mutate()} loading={create.isPending} disabled={!name.trim()} size="lg">{ui('nativeNavigation.createRoom')}</Button>
      </View>
    </SafeAreaView>
  );
}

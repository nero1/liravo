import { useState } from 'react';
import { View, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');

  const update = useMutation({
    mutationFn: () => api.put<{ user: any }>('/api/users/profile', { display_name: displayName, bio }),
    onSuccess: (res) => {
      setUser(res.user);
      router.back();
    },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 20 }}>
          <View className="items-center">
            <Avatar uri={user?.avatar_url} name={user?.display_name} size={80} />
          </View>
          <Input
            label="Display Name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            maxLength={60}
          />
          <Input
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell readers about yourself..."
            multiline
            numberOfLines={4}
            maxLength={300}
            style={{ minHeight: 96, textAlignVertical: 'top' }}
          />
          <Button onPress={() => update.mutate()} loading={update.isPending} size="lg">
            Save Changes
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

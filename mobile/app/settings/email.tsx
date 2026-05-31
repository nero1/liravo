import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function EmailSettingsScreen() {
  const { user } = useAuthStore();
  const [email, setEmail] = useState(user?.email ?? '');

  const sendVerification = useMutation({
    mutationFn: () => api.post('/api/users/send-verification', { email }),
    onSuccess: () => Alert.alert('Sent', 'Check your inbox for a verification link.'),
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card>
          <Text className="font-semibold text-foreground mb-1">Email Address</Text>
          <Text className="text-sm text-muted-foreground mb-3">
            {user?.email_verified ? '✅ Verified' : '⚠️ Not verified'}
          </Text>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {!user?.email_verified && (
            <Button
              onPress={() => sendVerification.mutate()}
              loading={sendVerification.isPending}
              variant="secondary"
              size="sm"
              style={{ marginTop: 8 }}
            >
              Send Verification Email
            </Button>
          )}
        </Card>
      </View>
    </SafeAreaView>
  );
}

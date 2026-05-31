import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function AppealScreen() {
  const { user } = useAuthStore();
  const [reason, setReason] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post('/api/moderation/appeals', { reason }),
    onSuccess: () => Alert.alert('Appeal Submitted', 'Your appeal will be reviewed by a moderator.'),
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  if (!user?.is_suspended) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={['bottom']}>
        <Text className="text-muted-foreground">Your account is in good standing.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card className="gap-3">
          <Text className="font-semibold text-foreground">Account Suspended</Text>
          {user.suspension_reason && (
            <Text className="text-sm text-muted-foreground">Reason: {user.suspension_reason}</Text>
          )}
          <Text className="text-sm text-muted-foreground">If you believe this is a mistake, submit an appeal.</Text>
          <Input
            label="Appeal Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="Explain why your account should be reinstated..."
            multiline
            numberOfLines={5}
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />
          <Button onPress={() => submit.mutate()} loading={submit.isPending} disabled={!reason.trim()}>
            Submit Appeal
          </Button>
        </Card>
      </View>
    </SafeAreaView>
  );
}

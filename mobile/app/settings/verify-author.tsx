import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function VerifyAuthorScreen() {
  const [publishedWork, setPublishedWork] = useState('');
  const [links, setLinks] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post('/api/author/verification-request', { published_work: publishedWork, links }),
    onSuccess: () => Alert.alert('Submitted', 'Your request will be reviewed within 3-5 business days.'),
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card className="gap-3">
          <Text className="font-semibold text-foreground">Author Verification</Text>
          <Text className="text-sm text-muted-foreground">
            Provide details about your published works. Our team will verify and grant you the Author badge.
          </Text>
          <Input label="Published Work(s)" value={publishedWork} onChangeText={setPublishedWork} placeholder="Book titles, ISBN, etc." />
          <Input label="Links (optional)" value={links} onChangeText={setLinks} placeholder="Amazon page, author website..." />
          <Button onPress={() => submit.mutate()} loading={submit.isPending} disabled={!publishedWork.trim()}>
            Submit Request
          </Button>
        </Card>
      </View>
    </SafeAreaView>
  );
}

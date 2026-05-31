import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function AccountScreen() {
  const { logout } = useAuth();

  const deleteAccount = useMutation({
    mutationFn: () => api.delete('/api/users/delete-account'),
    onSuccess: logout,
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  function confirmDelete() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteAccount.mutate() },
      ],
    );
  }

  async function exportData() {
    await WebBrowser.openBrowserAsync(`${process.env.EXPO_PUBLIC_API_URL}/api/users/export`);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card className="gap-3">
          <Text className="font-semibold text-foreground">Export Your Data</Text>
          <Text className="text-sm text-muted-foreground">Download a copy of all your Liravo data.</Text>
          <Button onPress={exportData} variant="secondary">Export Data</Button>
        </Card>

        <Card className="gap-3">
          <Text className="font-semibold text-destructive">Delete Account</Text>
          <Text className="text-sm text-muted-foreground">
            Permanently deletes your account and all associated data. This action cannot be undone.
          </Text>
          <Button onPress={confirmDelete} variant="destructive" loading={deleteAccount.isPending}>
            Delete My Account
          </Button>
        </Card>
      </View>
    </SafeAreaView>
  );
}

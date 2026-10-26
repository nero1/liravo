import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function SecurityScreen() {
  const { user } = useAuthStore();
  const [factorCode,setFactorCode]=useState('');
  const [pin, setPin] = useState('');

  const setNewPin = useMutation({
    mutationFn: () => api.post('/api/auth/pin', { pin }),
    onSuccess: () => { Alert.alert('PIN set', 'Your PIN has been saved.'); setPin(''); },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  const disable2fa = useMutation({
    mutationFn:()=>api.post('/api/auth/2fa/disable',/^\d{6}$/.test(factorCode)?{code:factorCode}:{recoveryCode:factorCode}),
    onSuccess:async()=>{const result=await api.get<{user:typeof user}>('/api/users/me');useAuthStore.getState().setUser(result.user);setFactorCode('');Alert.alert('2FA Disabled');},
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card className="gap-3">
          <Text className="font-semibold text-foreground">Two-Factor Authentication</Text>
          <Text className="text-sm text-muted-foreground">
            Status: {user?.totp_enabled ? '✅ Enabled' : '❌ Disabled'}
          </Text>
          {user?.totp_enabled ? (
            <View className="gap-3"><Input label="Authenticator or recovery code" value={factorCode} onChangeText={setFactorCode} autoCapitalize="characters" maxLength={11} /><Button variant="destructive" onPress={() => disable2fa.mutate()} loading={disable2fa.isPending} disabled={!/^\d{6}$|^[a-fA-F0-9]{5}-?[a-fA-F0-9]{5}$/.test(factorCode)} size="sm">
              Disable 2FA
            </Button></View>
          ) : (
            <Text className="text-sm text-muted-foreground">
              Enable 2FA from the web app for enhanced security.
            </Text>
          )}
        </Card>

        <Card className="gap-3">
          <Text className="font-semibold text-foreground">Account PIN</Text>
          <Text className="text-sm text-muted-foreground">Set a 4-digit PIN for quick account recovery.</Text>
          <Input
            label="New PIN (4 digits)"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            placeholder="••••"
          />
          <Button onPress={() => setNewPin.mutate()} loading={setNewPin.isPending} disabled={pin.length !== 4} size="sm">
            Save PIN
          </Button>
        </Card>
      </View>
    </SafeAreaView>
  );
}

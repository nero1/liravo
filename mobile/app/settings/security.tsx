import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState,useEffect } from 'react';
import { useMutation,useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {useTranslations} from '@/hooks/useTranslations';
import { Input } from '@/components/ui/Input';

export default function SecurityScreen() {
  const {t}=useTranslations('accountSecurity');
  const { user } = useAuthStore();
  const [factorCode,setFactorCode]=useState('');
  const [pin, setPin] = useState(''),[currentPin,setCurrentPin]=useState(''),[confirmPin,setConfirmPin]=useState('');
  useEffect(()=>{setPin('');setCurrentPin('');setConfirmPin('');setFactorCode('');},[user?.id]);
  const pinState=useQuery({queryKey:['pin-state',user?.id],enabled:!!user?.id,queryFn:()=>api.get<{configured:boolean}>('/api/auth/pin')});

  const setNewPin = useMutation({
    mutationFn: () => api.post('/api/auth/pin', { pin,...(pinState.data?.configured?{currentPin}:{}) },user?.id?{'X-Liravo-Actor':user.id}:undefined),
    onSuccess: async() => { Alert.alert(t('saved')); setPin('');setCurrentPin('');setConfirmPin('');await pinState.refetch(); },
    onError: () => Alert.alert(t('errorTitle'),t('failed')),
  });

  const disable2fa = useMutation({
    mutationFn:()=>api.post('/api/auth/2fa/disable',/^\d{6}$/.test(factorCode)?{code:factorCode}:{recoveryCode:factorCode}),
    onSuccess:async()=>{const result=await api.get<{user:typeof user}>('/api/users/me');useAuthStore.getState().setUser(result.user);setFactorCode('');Alert.alert(t('factorDisabled'));},
    onError: () => Alert.alert(t('errorTitle'),t('factorFailed')),
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card className="gap-3">
          <Text className="font-semibold text-foreground">{t('factorTitle')}</Text>
          <Text className="text-sm text-muted-foreground">
            {t(user?.totp_enabled?'factorEnabled':'factorDisabled')}
          </Text>
          {user?.totp_enabled ? (
            <View className="gap-3"><Input label={t('factorCode')} value={factorCode} onChangeText={setFactorCode} autoCapitalize="characters" maxLength={11} /><Button variant="destructive" onPress={() => disable2fa.mutate()} loading={disable2fa.isPending} disabled={!/^\d{6}$|^[a-fA-F0-9]{5}-?[a-fA-F0-9]{5}$/.test(factorCode)} size="sm">
              {t('disableFactor')}
            </Button></View>
          ) : (
            <Text className="text-sm text-muted-foreground">
              {t('enableFactorWeb')}
            </Text>
          )}
        </Card>

        <Card className="gap-3">
          <Text className="font-semibold text-foreground">{t('pinTitle')}</Text>
          <Text className="text-sm text-muted-foreground">{t('pinDescription')}</Text>
          {pinState.isError&&<Text accessibilityRole="alert">{t('failed')}</Text>}
          {pinState.data?.configured&&<Input label={t('currentPin')} secureTextEntry keyboardType="number-pad" maxLength={4} value={currentPin} onChangeText={value=>setCurrentPin(value.replace(/\D/g,'').slice(0,4))}/>}
          <Input
            label={t('newPin')}
            value={pin}
            onChangeText={value=>setPin(value.replace(/\D/g,'').slice(0,4))}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            placeholder="••••"
          />
          <Input label={t('confirmPin')} secureTextEntry keyboardType="number-pad" maxLength={4} value={confirmPin} onChangeText={value=>setConfirmPin(value.replace(/\D/g,'').slice(0,4))}/>
          <Button onPress={() => setNewPin.mutate()} loading={setNewPin.isPending} disabled={pin.length !== 4||pin!==confirmPin||!pinState.data||pinState.data.configured&&currentPin.length!==4} size="sm">
            {t('savePin')}
          </Button>
        </Card>
      </View>
    </SafeAreaView>
  );
}

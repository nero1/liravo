import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import {useState,useRef} from 'react';
import {shareAccountExport} from '@/lib/account-export';
import {useTranslations} from '@/hooks/useTranslations';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function AccountScreen() {
  const {logout}=useAuth(),{t}=useTranslations('accountData'),{t:common}=useTranslations('common'),busy=useRef(false),[exporting,setExporting]=useState(false);

  const deleteAccount = useMutation({
    mutationFn:async()=>{const result=await api.delete<{deleted:boolean}>('/api/users/delete-account');if(result.deleted!==true)throw new Error('Invalid account acknowledgement');return result;},
    onSuccess: logout,
    onError:()=>Alert.alert(common('error'),t('deleteFailed')),
  });

  function confirmDelete() {
    Alert.alert(
      t('delete'),t('deleteDescription'),
      [
        { text:common('cancel'), style: 'cancel' },
        { text:common('delete'), style: 'destructive', onPress: () => deleteAccount.mutate() },
      ],
    );
  }

  async function exportData(){
    if(busy.current)return;busy.current=true;setExporting(true);
    try{if(await shareAccountExport(t('exportTitle'))==='unavailable')Alert.alert(t('exportTitle'),t('exportUnavailable'));}
    catch{Alert.alert(common('error'),t('exportFailed'));}
    finally{busy.current=false;setExporting(false);}
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card className="gap-3">
          <Text className="font-semibold text-foreground">{t('exportTitle')}</Text>
          <Text className="text-sm text-muted-foreground">{t('exportDescription')}</Text>
          <Button onPress={exportData} loading={exporting} disabled={deleteAccount.isPending} variant="secondary">{exporting?t('exporting'):t('export')}</Button>
        </Card>

        <Card className="gap-3">
          <Text className="font-semibold text-destructive">{t('delete')}</Text>
          <Text className="text-sm text-muted-foreground">
            {t('deleteDescription')}
          </Text>
          <Button onPress={confirmDelete} variant="destructive" loading={deleteAccount.isPending} disabled={exporting}>
            {t('confirmDelete')}
          </Button>
        </Card>
      </View>
    </SafeAreaView>
  );
}

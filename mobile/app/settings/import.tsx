import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useTranslations } from '@/hooks/useTranslations';

export default function ImportScreen() {
  const {t}=useTranslations('goodreadsImport');
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<string | null>(null);
  const qc = useQueryClient();
  const importMutation = useMutation({
    mutationFn: () => api.post<{imported:number;skipped:number}>('/api/import/goodreads', { csv: csvData }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['shelves'] });
      Alert.alert(t('complete'),t('result',data));
    },
    onError: () => Alert.alert(t('errorTitle'),t('failed')),
  });
  async function pickFile() {
    try{
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv','text/comma-separated-values'],copyToCacheDirectory:true });
      if (result.canceled || !result.assets[0])return;
      const asset=result.assets[0];
      if((asset.size??0)>2_000_000){Alert.alert(t('errorTitle'),t('size'));return;}
      const response=await fetch(asset.uri),text=await response.text();
      if(new TextEncoder().encode(text).length>2_000_000){Alert.alert(t('errorTitle'),t('size'));return;}
      setFileName(asset.name);setCsvData(text);importMutation.reset();
    }catch{Alert.alert(t('errorTitle'),t('failed'));}
  }
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card className="gap-3">
          <Text accessibilityRole="header" className="font-semibold text-foreground">{t('title')}</Text>
          <Text className="text-sm text-muted-foreground">{t('description')}</Text>
          <Button onPress={pickFile} disabled={importMutation.isPending} variant="secondary">{fileName??t('choose')}</Button>
          {csvData&&<Button onPress={()=>importMutation.mutate()} loading={importMutation.isPending}>{t('submit')}</Button>}
        </Card>
      </View>
    </SafeAreaView>
  );
}

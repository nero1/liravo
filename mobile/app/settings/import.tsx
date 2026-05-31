import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function ImportScreen() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<string | null>(null);
  const qc = useQueryClient();

  const importMutation = useMutation({
    mutationFn: () => api.post('/api/import/goodreads', { csv: csvData }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['shelves'] });
      Alert.alert('Import complete', `Imported ${data.imported ?? 0} books.`);
    },
    onError: (err) => Alert.alert('Error', (err as Error).message),
  });

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFileName(asset.name);
      const response = await fetch(asset.uri);
      setCsvData(await response.text());
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-4 gap-4">
        <Card className="gap-3">
          <Text className="font-semibold text-foreground">Import from Goodreads</Text>
          <Text className="text-sm text-muted-foreground">
            Export your Goodreads library as a CSV file, then import it here. Your books will be added to the correct shelves.
          </Text>
          <Button onPress={pickFile} variant="secondary">
            {fileName ? `📄 ${fileName}` : 'Choose CSV File'}
          </Button>
          {csvData && (
            <Button onPress={() => importMutation.mutate()} loading={importMutation.isPending}>
              Import Books
            </Button>
          )}
        </Card>
      </View>
    </SafeAreaView>
  );
}

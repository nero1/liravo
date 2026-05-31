import { View, Text, FlatList, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AskScreen() {
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['write', 'questions'], queryFn: () => api.get<{ questions: any[] }>(ENDPOINTS.write.questions) });
  const submit = useMutation({ mutationFn: () => api.post(ENDPOINTS.write.questions, { content: question }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['write', 'questions'] }); setQuestion(''); Alert.alert('Question posted!'); }, onError: (err) => Alert.alert('Error', (err as Error).message) });
  if (isLoading) return <LoadingSpinner />;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="px-4 py-3 gap-2 border-b border-border">
        <TextInput value={question} onChangeText={setQuestion} placeholder="Ask a verified author a question..." placeholderTextColor="#9ca3af" className="bg-muted rounded-xl px-3 py-2.5 text-foreground" multiline maxLength={500} />
        <Button onPress={() => submit.mutate()} loading={submit.isPending} disabled={!question.trim()} size="sm">Post Question</Button>
      </View>
      <FlatList data={data?.questions ?? []} keyExtractor={(q) => q.id} renderItem={({ item }) => (
        <View className="px-4 py-4 border-b border-border gap-2">
          <Text className="font-medium text-foreground">{item.content}</Text>
          {item.answer && <View className="bg-muted rounded-lg p-3"><Text className="text-sm text-foreground">{item.answer}</Text><Text className="text-xs text-muted-foreground mt-1">— {item.answerer?.display_name}</Text></View>}
        </View>
      )} ListEmptyComponent={<EmptyState title="No questions yet" description="Be the first to ask a verified author." />} contentContainerStyle={{ paddingBottom: 24 }} />
    </SafeAreaView>
  );
}

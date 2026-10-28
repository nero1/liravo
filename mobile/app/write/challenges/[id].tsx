import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function WritingChallengeDetailScreen() {
  const {t:ui}=useTranslations('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [submission, setSubmission] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['write', 'challenge', id], queryFn: () => api.get<{ challenge: any }>(ENDPOINTS.write.challengeById(id!)), enabled: !!id });
  const join = useMutation({ mutationFn: () => api.post(ENDPOINTS.write.joinChallenge(id!)), onSuccess: () => { qc.invalidateQueries({ queryKey: ['write', 'challenge', id] }); Alert.alert('Joined!'); }, onError: (err) => Alert.alert('Error', (err as Error).message) });
  const submit = useMutation({ mutationFn: () => api.post(ENDPOINTS.write.submitChallenge(id!), { title: title.trim(), body: submission.trim() }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['write', 'challenge', id] }); Alert.alert('Submitted!'); setSubmission(''); }, onError: (err) => Alert.alert('Error', (err as Error).message) });
  const challenge = data?.challenge;
  if (isLoading || !challenge) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
          <Text className="text-2xl font-bold text-foreground">{challenge.title}</Text>
          {challenge.description && <Text className="text-foreground">{challenge.description}</Text>}
          <View className="flex-row gap-4 flex-wrap"><Text className="text-sm text-muted-foreground">🏆 {challenge.xp_reward} XP</Text>{challenge.word_limit && <Text className="text-sm text-muted-foreground">📝 {challenge.word_limit} word limit</Text>}{challenge.deadline && <Text className="text-sm text-muted-foreground">📅 Due {new Date(challenge.deadline).toLocaleDateString()}</Text>}</View>
          <Button onPress={() => join.mutate()} loading={join.isPending} variant="outline">{ui('writingChallenge.join')}</Button>
          <Input label="Entry title" value={title} onChangeText={setTitle} maxLength={200} />
          <Input label="Your Submission" value={submission} onChangeText={setSubmission} placeholder="Write here..." multiline numberOfLines={10} maxLength={challenge.word_limit ? challenge.word_limit * 7 : 10000} style={{ minHeight: 200, textAlignVertical: 'top' }} />
          <Button onPress={() => submit.mutate()} loading={submit.isPending} disabled={!title.trim() || submission.trim().length < 10} size="lg">Submit Entry</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const WRITING_SECTIONS = [
  { emoji: '✍️', label: 'prompts', path: '/write/prompts', desc: 'promptsDescription' },
  { emoji: '🏆', label: 'challenges', path: '/write/challenges', desc: 'challengesDescription' },
  { emoji: '👥', label: 'workshops', path: '/write/workshops', desc: 'workshopsDescription' },
  { emoji: '📊', label: 'progress', path: '/write/progress', desc: 'progressDescription' },
  { emoji: '📚', label: 'resources', path: '/write/resources', desc: 'resourcesDescription' },
  { emoji: '❓', label: 'ask', path: '/write/ask', desc: 'askDescription' },
  { emoji: '📝', label: 'plan', path: '/write/my-plan', desc: 'planDescription' },
] as const;

export default function WriteTabScreen() {
  const {t}=useTranslations('writingHub');
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 8 }}>
        <View className="mb-2">
          <Text className="text-2xl font-bold text-foreground">{t('title')}</Text>
          <Text className="text-muted-foreground text-sm mt-1">{t('subtitle')}</Text>
        </View>
        {WRITING_SECTIONS.map(({ emoji, label, path, desc }) => (
          <TouchableOpacity accessibilityRole="link"
            key={path}
            onPress={() => router.push(path as never)}
            className="flex-row items-center bg-card border border-border rounded-xl p-4 gap-3"
            activeOpacity={0.7}
          >
            <Text className="text-3xl">{emoji}</Text>
            <View className="flex-1">
              <Text className="font-semibold text-foreground">{t(label)}</Text>
              <Text className="text-sm text-muted-foreground">{t(desc)}</Text>
            </View>
            <Text className="text-muted-foreground">›</Text>
          </TouchableOpacity>
        ))}
        <View className="h-4" />
      </ScrollView>
    </SafeAreaView>
  );
}

import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const WRITING_SECTIONS = [
  { emoji: '✍️', label: 'Daily Prompts', path: '/write/prompts', desc: "Today's writing prompts" },
  { emoji: '🏆', label: 'Writing Challenges', path: '/write/challenges', desc: 'Compete and win XP' },
  { emoji: '👥', label: 'Workshops', path: '/write/workshops', desc: 'Critique & feedback groups' },
  { emoji: '📊', label: 'My Progress', path: '/write/progress', desc: 'Track your word count' },
  { emoji: '📚', label: 'Resources', path: '/write/resources', desc: 'Craft books & guides' },
  { emoji: '❓', label: 'Ask an Author', path: '/write/ask', desc: 'Q&A with verified authors' },
  { emoji: '📝', label: 'My Writing Plan', path: '/write/my-plan', desc: 'Your personal roadmap' },
] as const;

export default function WriteScreen() {
  const {t:ui}=useTranslations('');
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text className="text-2xl font-bold text-foreground mb-2">{ui('writingHub.title')}</Text>
        {WRITING_SECTIONS.map(({ emoji, label, path, desc }) => (
          <TouchableOpacity key={path} onPress={() => router.push(path as any)} className="flex-row items-center bg-card border border-border rounded-xl p-4 gap-3" activeOpacity={0.7}>
            <Text className="text-3xl">{emoji}</Text>
            <View className="flex-1">
              <Text className="font-semibold text-foreground">{label}</Text>
              <Text className="text-sm text-muted-foreground">{desc}</Text>
            </View>
            <Text className="text-muted-foreground">›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

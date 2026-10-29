import {useTranslations} from '@/hooks/useTranslations';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const WRITING_SECTIONS=[
  {emoji:'✍️',key:'prompts',path:'/write/prompts'},
  {emoji:'🏆',key:'challenges',path:'/write/challenges'},
  {emoji:'👥',key:'workshops',path:'/write/workshops'},
  {emoji:'📊',key:'progress',path:'/write/progress'},
  {emoji:'📚',key:'resources',path:'/write/resources'},
  {emoji:'❓',key:'ask',path:'/write/ask'},
  {emoji:'📝',key:'plan',path:'/write/my-plan'},
] as const;

export default function WriteScreen() {
  const {t:ui}=useTranslations('');
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text className="text-2xl font-bold text-foreground mb-2">{ui('writingHub.title')}</Text>
        {WRITING_SECTIONS.map(({ emoji,key,path }) => (
          <TouchableOpacity key={path} onPress={() => router.push(path as any)} className="flex-row items-center bg-card border border-border rounded-xl p-4 gap-3" activeOpacity={0.7}>
            <Text className="text-3xl">{emoji}</Text>
            <View className="flex-1">
              <Text className="font-semibold text-foreground">{ui('writingHub.'+key)}</Text>
              <Text className="text-sm text-muted-foreground">{ui('writingHub.'+key+'Description')}</Text>
            </View>
            <Text className="text-muted-foreground">›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

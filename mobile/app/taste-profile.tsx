import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function TasteProfileScreen() {
  const { data, isLoading } = useQuery({ queryKey: ['taste-profile'], queryFn: () => api.get<{ profile: any }>(ENDPOINTS.tasteProfile) });
  if (isLoading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#d97706" /></View>;
  const profile = data?.profile;
  if (!profile) return <View className="flex-1 items-center justify-center bg-background px-4"><Text className="text-muted-foreground text-center">Read at least 3 books to generate your taste profile.</Text></View>;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}>
        {profile.summary && <Card><Text className="font-semibold text-foreground mb-2">Your Reading Taste</Text><Text className="text-foreground leading-relaxed">{profile.summary}</Text></Card>}
        {profile.top_genres?.length > 0 && <Card><Text className="font-semibold text-foreground mb-3">Top Genres</Text><View className="flex-row flex-wrap gap-2">{profile.top_genres.map((g: string) => <Badge key={g} variant="accent">{g}</Badge>)}</View></Card>}
        {profile.mood_preferences?.length > 0 && <Card><Text className="font-semibold text-foreground mb-3">Reading Moods</Text><View className="flex-row flex-wrap gap-2">{profile.mood_preferences.map((m: string) => <Badge key={m}>{m}</Badge>)}</View></Card>}
      </ScrollView>
    </SafeAreaView>
  );
}

import { View, Text, Switch, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';

interface NotifPrefs {
  email_digest_enabled: boolean;
  notify_follows: boolean;
  notify_likes: boolean;
  notify_replies: boolean;
  notify_mentions: boolean;
  notify_author_announcements: boolean;
  notify_new_releases: boolean;
  notify_challenge_completions: boolean;
  notify_arc_grants: boolean;
}

const LABELS: Record<keyof NotifPrefs, string> = {
  email_digest_enabled: 'Weekly email digest (paid)',
  notify_follows: 'New followers',
  notify_likes: 'Likes on my reviews',
  notify_replies: 'Replies to my reviews',
  notify_mentions: 'Mentions',
  notify_author_announcements: 'Author announcements',
  notify_new_releases: 'New releases (email, paid)',
  notify_challenge_completions: 'Challenge completions',
  notify_arc_grants: 'ARC application status',
};

export default function NotificationSettingsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: Partial<NotifPrefs> }>(ENDPOINTS.users.me),
  });

  const [prefs, setPrefs] = useState<NotifPrefs>({
    email_digest_enabled: true,
    notify_follows: true,
    notify_likes: true,
    notify_replies: true,
    notify_mentions: true,
    notify_author_announcements: true,
    notify_new_releases: true,
    notify_challenge_completions: true,
    notify_arc_grants: true,
  });

  useEffect(() => {
    if (data?.user) {
      setPrefs((prev) => ({ ...prev, ...data.user }));
    }
  }, [data]);

  const { mutate: save } = useMutation({
    mutationFn: (update: Partial<NotifPrefs>) =>
      api.patch(ENDPOINTS.users.profile, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  function toggle(key: keyof NotifPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    save({ [key]: next[key] });
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#d97706" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
        <Text className="text-2xl font-bold text-foreground mb-2">Notifications</Text>
        <Text className="text-muted-foreground text-sm mb-6">Control which notifications you receive.</Text>

        <View className="gap-1">
          {(Object.keys(LABELS) as (keyof NotifPrefs)[]).map((key) => (
            <View
              key={key}
              className="flex-row items-center justify-between p-4 rounded-xl border border-border bg-card"
            >
              <Text className="text-sm text-foreground flex-1 pr-4">{LABELS[key]}</Text>
              <Switch
                value={prefs[key]}
                onValueChange={() => toggle(key)}
                trackColor={{ false: '#e5e7eb', true: '#d97706' }}
                thumbColor="#ffffff"
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import {View,Text} from 'react-native';
import {Button} from '@/components/ui/Button';
import {useTranslations} from '@/hooks/useTranslations';
import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/auth';
import {usePreferences,supportedLocale} from '@/stores/preferences';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePushNotifications } from '@/hooks/usePushNotifications';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading,authUnavailable,retryAuthentication } = useAuth(true);
  const {t}=useTranslations('auth'),common=useTranslations('common');
  const { user, token, mfaChallenge } = useAuthStore();
  const setLocale=usePreferences(state=>state.setLocale);
  useEffect(()=>{if(supportedLocale(user?.preferred_locale))void setLocale(user.preferred_locale).catch(()=>{});},[user?.preferred_locale,setLocale]);
  const segments:string[]=useSegments();
  const router = useRouter();
  usePushNotifications();

  useEffect(() => {
    if (isLoading||authUnavailable&&!user) return;

    const inAuth = segments[0] === 'auth';
    if(mfaChallenge){if(!inAuth||segments[1]!=='welcome')router.replace('/auth/welcome');return;}
    const isAuthenticated=!!token&&!!user&&!mfaChallenge;

    if (!isAuthenticated && !inAuth) {
      router.replace('/auth/welcome');
    } else if (isAuthenticated && inAuth) {
      if (user && !user.onboarding_complete) {
        router.replace('/auth/onboarding');
      } else {
        router.replace('/(tabs)/feed');
      }
    } else if (isAuthenticated && user && !user.onboarding_complete && segments[1] !== 'onboarding') {
      router.replace('/auth/onboarding');
    }
  }, [isLoading,token,user,mfaChallenge,segments,router,authUnavailable]);

  if (isLoading) return <LoadingSpinner />;
  if(authUnavailable&&!user)return <View className="flex-1 justify-center px-6 gap-4"><Text accessibilityRole="alert" className="text-foreground">{t('unavailable')}</Text><Button onPress={retryAuthentication}>{common.t('retry')}</Button></View>;

  return <>{children}</>;
}

export default function RootLayout() {
  const {t}=useTranslations('nativeNavigation');
  const hydrate=usePreferences(state=>state.hydrate);
  useEffect(()=>{void hydrate();},[hydrate]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <AuthGuard>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="auth" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="work/[id]" options={{headerShown:true,title:''}} />
              <Stack.Screen name="book/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="user/[username]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="review/new" options={{ headerShown: true, title: t('writeReview'), presentation: 'modal' }} />
              <Stack.Screen name="quote/new" options={{ headerShown: true, title: t('saveQuote'), presentation: 'modal' }} />
              <Stack.Screen name="settings" options={{ headerShown: true, title: t('settings') }} />
              <Stack.Screen name="settings/email" options={{ headerShown: true, title: t('emailSettings') }} />
              <Stack.Screen name="settings/security" options={{ headerShown: true, title: t('security') }} />
              <Stack.Screen name="settings/import" options={{ headerShown: true, title: t('importBooks') }} />
              <Stack.Screen name="settings/verify-author" options={{ headerShown: true, title: t('verifyAuthor') }} />
              <Stack.Screen name="settings/appeal" options={{ headerShown: true, title: t('accountAppeal') }} />
              <Stack.Screen name="settings/account" options={{ headerShown: true, title: t('account') }} />
              <Stack.Screen name="leaderboard" options={{ headerShown: true, title: t('leaderboard') }} />
              <Stack.Screen name="stats" options={{ headerShown: true, title: t('readingStats') }} />
              <Stack.Screen name="wrapped" options={{ headerShown: true, title: t('yourYearinBooks') }} />
              <Stack.Screen name="taste-profile" options={{ headerShown: true, title: t('tasteProfile') }} />
              <Stack.Screen name="challenges" options={{ headerShown: true, title: t('challenges') }} />
              <Stack.Screen name="challenges/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="buddy-reads" options={{ headerShown: true, title: t('buddyReads') }} />
              <Stack.Screen name="buddy-reads/new" options={{ headerShown: true, title: t('startBuddyRead'), presentation: 'modal' }} />
              <Stack.Screen name="buddy-reads/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="reading-rooms" options={{ headerShown: true, title: t('readingRooms') }} />
              <Stack.Screen name="reading-rooms/new" options={{ headerShown: true, title: t('createRoom'), presentation: 'modal' }} />
              <Stack.Screen name="reading-rooms/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="debates" options={{ headerShown: true, title: t('debates') }} />
              <Stack.Screen name="debates/new" options={{ headerShown: true, title: t('newDebate') }} />
              <Stack.Screen name="debates/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="events" options={{ headerShown: true, title: t('events') }} />
              <Stack.Screen name="events/new" options={{ headerShown: true, title: t('createEvent'), presentation: 'modal' }} />
              <Stack.Screen name="events/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="pass-the-book" options={{ headerShown: true, title: t('passtheBook') }} />
              <Stack.Screen name="lists" options={{ headerShown: true, title: t('readingLists') }} />
              <Stack.Screen name="lists/new" options={{ headerShown: true, title: t('newList'), presentation: 'modal' }} />
              <Stack.Screen name="lists/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="quotes" options={{ headerShown: true, title: t('myQuotes') }} />
              <Stack.Screen name="write" options={{ headerShown: true, title: t('write') }} />
              <Stack.Screen name="write/prompts" options={{ headerShown: true, title: t('writingPrompts') }} />
              <Stack.Screen name="write/prompts/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="write/challenges" options={{ headerShown: true, title: t('writingChallenges') }} />
              <Stack.Screen name="write/challenges/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="write/workshops" options={{ headerShown: true, title: t('workshops') }} />
              <Stack.Screen name="write/workshops/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="write/progress" options={{ headerShown: true, title: t('writingProgress') }} />
              <Stack.Screen name="write/resources" options={{ headerShown: true, title: t('resources') }} />
              <Stack.Screen name="write/ask" options={{ headerShown: true, title: t('askanAuthor') }} />
              <Stack.Screen name="write/ask/[id]" options={{headerShown:true,title:t('askanAuthor')}}/>
              <Stack.Screen name="write/my-plan" options={{ headerShown: true, title: t('myWritingPlan') }} />
              <Stack.Screen name="author/[username]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="author/arcs" options={{ headerShown: true, title: t('aRCs') }} />
              <Stack.Screen name="author/arcs/new" options={{ headerShown: true, title: t('newARC'), presentation: 'modal' }} />
              <Stack.Screen name="author/arcs/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="author/posts/new" options={{ headerShown: true, title: t('newPost'), presentation: 'modal' }} />
              <Stack.Screen name="creator/dashboard" options={{ headerShown: true, title: t('creatorDashboard') }} />
              <Stack.Screen name="creator/leaderboard" options={{ headerShown: true, title: t('creatorLeaderboard') }} />
              <Stack.Screen name="earnings" options={{ headerShown: true, title: t('earnings') }} />
              <Stack.Screen name="premium" options={{ headerShown: true, title: t('premium') }} />
              <Stack.Screen name="referral" options={{ headerShown: true, title: t('referral') }} />
              <Stack.Screen name="reading-goals" options={{ headerShown: true, title: t('readingGoal') }} />
              <Stack.Screen name="arcs" options={{ headerShown: true, title: t('aRCLibrary') }} />
              <Stack.Screen name="arcs/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="moderation/reports" options={{ headerShown: true, title: t('reports') }} />
              <Stack.Screen name="moderation/appeals" options={{ headerShown: true, title: t('appeals') }} />
              <Stack.Screen name="moderation/log" options={{ headerShown: true, title: t('moderationLog') }} />
              <Stack.Screen name="admin" options={{ headerShown: true, title: t('admin') }} />
              <Stack.Screen name="admin/users" options={{ headerShown: true, title: t('users') }} />
              <Stack.Screen name="admin/books" options={{ headerShown: true, title: t('books') }} />
              <Stack.Screen name="admin/feature-flags" options={{ headerShown: true, title: t('featureFlags') }} />
              <Stack.Screen name="admin/affiliate-stores" options={{ headerShown: true, title: t('affiliateStores') }} />
              <Stack.Screen name="admin/promoted-listings" options={{ headerShown: true, title: t('promotedListings') }} />
              <Stack.Screen name="admin/seasonal-events" options={{ headerShown: true, title: t('seasonalEvents') }} />
              <Stack.Screen name="admin/writing-challenges" options={{ headerShown: true, title: t('writingChallenges') }} />
              <Stack.Screen name="admin/theme" options={{ headerShown: true, title: t('theme') }} />
              <Stack.Screen name="admin/cron-status" options={{ headerShown: true, title: t('cronStatus') }} />
            </Stack>
          </AuthGuard>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

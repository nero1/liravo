import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from '@stripe/stripe-react-native';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();
  const { user, token } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuth = segments[0] === 'auth';
    const isAuthenticated = !!token;

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
  }, [isLoading, token, user, segments]);

  if (isLoading) return <LoadingSpinner />;

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider publishableKey={STRIPE_KEY} merchantIdentifier="merchant.org.liravo">
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <AuthGuard>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="auth" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="book/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="user/[username]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="review/new" options={{ headerShown: true, title: 'Write Review', presentation: 'modal' }} />
              <Stack.Screen name="quote/new" options={{ headerShown: true, title: 'Save Quote', presentation: 'modal' }} />
              <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
              <Stack.Screen name="settings/email" options={{ headerShown: true, title: 'Email Settings' }} />
              <Stack.Screen name="settings/security" options={{ headerShown: true, title: 'Security' }} />
              <Stack.Screen name="settings/import" options={{ headerShown: true, title: 'Import Books' }} />
              <Stack.Screen name="settings/verify-author" options={{ headerShown: true, title: 'Verify Author' }} />
              <Stack.Screen name="settings/appeal" options={{ headerShown: true, title: 'Account Appeal' }} />
              <Stack.Screen name="settings/account" options={{ headerShown: true, title: 'Account' }} />
              <Stack.Screen name="leaderboard" options={{ headerShown: true, title: 'Leaderboard' }} />
              <Stack.Screen name="stats" options={{ headerShown: true, title: 'Reading Stats' }} />
              <Stack.Screen name="wrapped" options={{ headerShown: true, title: 'Your Year in Books' }} />
              <Stack.Screen name="taste-profile" options={{ headerShown: true, title: 'Taste Profile' }} />
              <Stack.Screen name="challenges" options={{ headerShown: true, title: 'Challenges' }} />
              <Stack.Screen name="challenges/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="buddy-reads" options={{ headerShown: true, title: 'Buddy Reads' }} />
              <Stack.Screen name="buddy-reads/new" options={{ headerShown: true, title: 'Start Buddy Read', presentation: 'modal' }} />
              <Stack.Screen name="buddy-reads/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="reading-rooms" options={{ headerShown: true, title: 'Reading Rooms' }} />
              <Stack.Screen name="reading-rooms/new" options={{ headerShown: true, title: 'Create Room', presentation: 'modal' }} />
              <Stack.Screen name="reading-rooms/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="debates" options={{ headerShown: true, title: 'Debates' }} />
              <Stack.Screen name="debates/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="events" options={{ headerShown: true, title: 'Events' }} />
              <Stack.Screen name="events/new" options={{ headerShown: true, title: 'Create Event', presentation: 'modal' }} />
              <Stack.Screen name="events/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="pass-the-book" options={{ headerShown: true, title: 'Pass the Book' }} />
              <Stack.Screen name="lists" options={{ headerShown: true, title: 'Reading Lists' }} />
              <Stack.Screen name="lists/new" options={{ headerShown: true, title: 'New List', presentation: 'modal' }} />
              <Stack.Screen name="lists/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="quotes" options={{ headerShown: true, title: 'My Quotes' }} />
              <Stack.Screen name="write" options={{ headerShown: true, title: 'Write' }} />
              <Stack.Screen name="write/prompts" options={{ headerShown: true, title: 'Writing Prompts' }} />
              <Stack.Screen name="write/prompts/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="write/challenges" options={{ headerShown: true, title: 'Writing Challenges' }} />
              <Stack.Screen name="write/challenges/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="write/workshops" options={{ headerShown: true, title: 'Workshops' }} />
              <Stack.Screen name="write/workshops/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="write/progress" options={{ headerShown: true, title: 'Writing Progress' }} />
              <Stack.Screen name="write/resources" options={{ headerShown: true, title: 'Resources' }} />
              <Stack.Screen name="write/ask" options={{ headerShown: true, title: 'Ask an Author' }} />
              <Stack.Screen name="write/my-plan" options={{ headerShown: true, title: 'My Writing Plan' }} />
              <Stack.Screen name="author/[username]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="author/arcs" options={{ headerShown: true, title: 'ARCs' }} />
              <Stack.Screen name="author/arcs/new" options={{ headerShown: true, title: 'New ARC', presentation: 'modal' }} />
              <Stack.Screen name="author/arcs/[id]" options={{ headerShown: true, title: '' }} />
              <Stack.Screen name="author/posts/new" options={{ headerShown: true, title: 'New Post', presentation: 'modal' }} />
              <Stack.Screen name="creator/dashboard" options={{ headerShown: true, title: 'Creator Dashboard' }} />
              <Stack.Screen name="creator/leaderboard" options={{ headerShown: true, title: 'Creator Leaderboard' }} />
              <Stack.Screen name="earnings" options={{ headerShown: true, title: 'Earnings' }} />
              <Stack.Screen name="premium" options={{ headerShown: true, title: 'Premium' }} />
              <Stack.Screen name="referral" options={{ headerShown: true, title: 'Referral' }} />
              <Stack.Screen name="moderation/reports" options={{ headerShown: true, title: 'Reports' }} />
              <Stack.Screen name="moderation/appeals" options={{ headerShown: true, title: 'Appeals' }} />
              <Stack.Screen name="moderation/log" options={{ headerShown: true, title: 'Moderation Log' }} />
              <Stack.Screen name="admin" options={{ headerShown: true, title: 'Admin' }} />
              <Stack.Screen name="admin/users" options={{ headerShown: true, title: 'Users' }} />
              <Stack.Screen name="admin/books" options={{ headerShown: true, title: 'Books' }} />
              <Stack.Screen name="admin/feature-flags" options={{ headerShown: true, title: 'Feature Flags' }} />
              <Stack.Screen name="admin/affiliate-stores" options={{ headerShown: true, title: 'Affiliate Stores' }} />
              <Stack.Screen name="admin/promoted-listings" options={{ headerShown: true, title: 'Promoted Listings' }} />
              <Stack.Screen name="admin/seasonal-events" options={{ headerShown: true, title: 'Seasonal Events' }} />
              <Stack.Screen name="admin/writing-challenges" options={{ headerShown: true, title: 'Writing Challenges' }} />
              <Stack.Screen name="admin/theme" options={{ headerShown: true, title: 'Theme' }} />
              <Stack.Screen name="admin/cron-status" options={{ headerShown: true, title: 'Cron Status' }} />
            </Stack>
          </AuthGuard>
        </QueryClientProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function WelcomeScreen() {
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    try {
      const redirectUrl = makeRedirectUri({ scheme: 'liravo', path: 'auth/callback' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No auth URL returned');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      }
    } catch (err) {
      Alert.alert('Sign in failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 justify-between py-12">
        <View className="items-center gap-4">
          <View className="w-20 h-20 bg-accent rounded-2xl items-center justify-center">
            <Text className="text-4xl">📚</Text>
          </View>
          <Text className="text-4xl font-bold text-foreground">Liravo</Text>
          <Text className="text-muted-foreground text-center text-lg max-w-xs">
            Discover books through people you trust, not algorithms.
          </Text>
        </View>

        <View className="gap-4">
          <TouchableOpacity
            onPress={signInWithGoogle}
            disabled={loading}
            className="bg-white border border-border rounded-xl py-4 flex-row items-center justify-center gap-3 shadow-sm"
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#1a1a1a" />
            ) : (
              <>
                <Text className="text-2xl">G</Text>
                <Text className="font-semibold text-foreground text-base">Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text className="text-center text-xs text-muted-foreground px-4">
            By continuing, you agree to Liravo's Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

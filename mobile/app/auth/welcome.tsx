import {
  View, Text, TouchableOpacity, Alert, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { isSupabaseMode, supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '';

export default function WelcomeScreen() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const {loginWithEmail,signUpWithEmail,loginWithGoogleToken,mfaChallenge,verifySecondFactor,logout}=useAuth();
  const [factorCode,setFactorCode]=useState(''),[useRecovery,setUseRecovery]=useState(false);

  // Google OAuth request (used only in DO mode)
  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });

  // ── Supabase Google OAuth ────────────────────────────────────────────────────
  async function signInWithGoogleSupabase() {
    setLoading(true);
    try {
      const redirectUrl = makeRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No auth URL returned');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) await supabase.auth.exchangeCodeForSession(code);
      }
    } catch (err) {
      Alert.alert('Sign in failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── DO mode Google OAuth ─────────────────────────────────────────────────────
  async function signInWithGoogleDO() {
    setLoading(true);
    try {
      const result = await promptGoogleAsync();
      if (result.type !== 'success') return;
      const idToken = result.authentication?.idToken;
      if (!idToken) throw new Error('No ID token from Google');
      await loginWithGoogleToken(idToken);
    } catch (err) {
      Alert.alert('Sign in failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Email / password ─────────────────────────────────────────────────────────
  async function handleEmailAuth() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      if (tab === 'login') {
        await loginWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(email.trim(), password);
      }
    } catch (err) {
      Alert.alert(tab === 'login' ? 'Login failed' : 'Sign up failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const signInWithGoogle = isSupabaseMode ? signInWithGoogleSupabase : signInWithGoogleDO;

  if(mfaChallenge)return <SafeAreaView className="flex-1 bg-background px-6 justify-center gap-4">
    <Text className="text-2xl font-bold text-foreground">Two-factor verification</Text>
    <Text className="text-muted-foreground">{useRecovery?'Enter a recovery code.':'Enter a code from your authenticator app.'}</Text>
    <TextInput accessibilityLabel={useRecovery?'Recovery code':'Authenticator code'} value={factorCode} onChangeText={setFactorCode} autoCapitalize="characters" keyboardType={useRecovery?'default':'number-pad'} maxLength={useRecovery?11:6} textContentType="oneTimeCode" className="border border-border rounded-xl p-4 text-foreground" />
    <TouchableOpacity accessibilityRole="button" disabled={loading} className="rounded-xl bg-accent p-4 items-center" onPress={async()=>{setLoading(true);try{await verifySecondFactor(factorCode,useRecovery);}catch{Alert.alert('Verification failed','Check the code or sign in again if the challenge expired.');}finally{setLoading(false);}}}><Text className="text-white">{loading?'Verifying…':'Verify and continue'}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={()=>{setUseRecovery(!useRecovery);setFactorCode('');}}><Text className="text-accent">{useRecovery?'Use authenticator code':'Use a recovery code'}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={()=>{setFactorCode('');void logout();}}><Text className="text-muted-foreground">Back to sign in</Text></TouchableOpacity>
  </SafeAreaView>;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 justify-between py-12">

            {/* Logo */}
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
              {/* Google button — shown in both modes */}
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
                    <Text className="text-2xl font-bold text-[#4285F4]">G</Text>
                    <Text className="font-semibold text-foreground text-base">Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Email / password — only in DO mode */}
              {!isSupabaseMode && (
                <>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1 h-px bg-border" />
                    <Text className="text-muted-foreground text-xs">or</Text>
                    <View className="flex-1 h-px bg-border" />
                  </View>

                  {/* Tab switcher */}
                  <View className="flex-row border border-border rounded-xl overflow-hidden">
                    {(['login', 'signup'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setTab(t)}
                        className={`flex-1 py-3 items-center ${tab === t ? 'bg-accent' : 'bg-transparent'}`}
                        activeOpacity={0.8}
                      >
                        <Text className={`font-semibold capitalize ${tab === t ? 'text-white' : 'text-muted-foreground'}`}>
                          {t === 'login' ? 'Log In' : 'Sign Up'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput
                    className="border border-border rounded-xl px-4 py-3.5 text-foreground bg-muted"
                    placeholder="Email"
                    placeholderTextColor="#6b7280"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={setEmail}
                  />
                  <TextInput
                    className="border border-border rounded-xl px-4 py-3.5 text-foreground bg-muted"
                    placeholder="Password"
                    placeholderTextColor="#6b7280"
                    secureTextEntry
                    textContentType={tab === 'signup' ? 'newPassword' : 'password'}
                    value={password}
                    onChangeText={setPassword}
                  />

                  <TouchableOpacity
                    onPress={handleEmailAuth}
                    disabled={loading}
                    className="bg-accent rounded-xl py-4 items-center"
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="font-semibold text-white text-base">
                        {tab === 'login' ? 'Log In' : 'Create Account'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <Text className="text-center text-xs text-muted-foreground px-4">
                By continuing, you agree to Liravo's Terms of Service and Privacy Policy.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

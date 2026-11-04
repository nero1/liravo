import {
  View, Text, TouchableOpacity, Alert, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api,ApiError} from '@/lib/api';
import {HCaptchaChallenge} from '@/components/auth/HCaptchaChallenge';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { isSupabaseMode, supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {useTranslations} from '@/hooks/useTranslations';
import {LocaleSwitcher} from '@/components/ui/LocaleSwitcher';
import {API_BASE} from '@/constants/api';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '';

export default function WelcomeScreen() {
  const {t}=useTranslations('auth'),{t:emailSecurity}=useTranslations('emailSecurity');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const {loginWithEmail,signUpWithEmail,loginWithGoogleToken,mfaChallenge,verifySecondFactor,logout}=useAuth();
  const [factorCode,setFactorCode]=useState(''),[useRecovery,setUseRecovery]=useState(false);
  const authConfig=useQuery({queryKey:['auth-config'],enabled:!isSupabaseMode,queryFn:async()=>{const data=await api.get<{enabled:boolean;siteKey:string|null}>('/api/auth/config');if(typeof data.enabled!=='boolean'||data.siteKey!==null&&typeof data.siteKey!=='string')throw new Error('Authentication configuration unavailable');return data;}});
  const [captchaRequired,setCaptchaRequired]=useState(false),[captchaOpen,setCaptchaOpen]=useState(false),pendingForm=useRef<{email:string;password:string;tab:'login'|'signup'}|null>(null);
  useEffect(()=>()=>{pendingForm.current=null;},[]);

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
    } catch {
      Alert.alert(t('signIn'),t('signInFailed'));
    } finally {
      setLoading(false);
    }
  }

  // ── Email / password ─────────────────────────────────────────────────────────
  async function submitCredentials(form:{email:string;password:string;tab:'login'|'signup'},captchaToken?:string){
    setLoading(true);
    try{if(form.tab==='login')await loginWithEmail(form.email,form.password,captchaToken);else await signUpWithEmail(form.email,form.password,captchaToken);}
    catch(error){
      if(error instanceof ApiError&&error.requireCaptcha){setCaptchaRequired(true);void authConfig.refetch();}
      const key=error instanceof ApiError&&error.code==='CAPTCHA_UNAVAILABLE'?'captchaUnavailable':error instanceof ApiError&&['CAPTCHA_REQUIRED','CAPTCHA_INVALID'].includes(error.code??'')?'captchaRequired':error instanceof ApiError&&error.code==='PASSWORD_TOO_LONG'?'passwordTooLong':'signInFailed';
      Alert.alert(t('signIn'),t(key));
    }finally{setLoading(false);}
  }
  async function handleEmailAuth(){
    if(loading||captchaOpen)return;
    if(!email.trim()||!password){Alert.alert(t('signIn'),t('signInFailed'));return;}
    if(!authConfig.data||authConfig.isError){Alert.alert(t('signIn'),t('captchaUnavailable'));return;}
    const form={email:email.trim(),password,tab};
    if(authConfig.data.enabled&&(tab==='signup'||captchaRequired)){
      if(!authConfig.data.siteKey){Alert.alert(t('signIn'),t('captchaUnavailable'));return;}
      pendingForm.current=form;setCaptchaOpen(true);return;
    }
    await submitCredentials(form);
  }



  if(mfaChallenge)return <SafeAreaView className="flex-1 bg-background px-6 justify-center gap-4">
    <Text className="text-2xl font-bold text-foreground">{t('mfaTitle')}</Text>
    <Text className="text-muted-foreground">{t('mfaDescription')}</Text>
    <TextInput accessibilityLabel={t(useRecovery?'recoveryCode':'authenticatorCode')} value={factorCode} onChangeText={setFactorCode} autoCapitalize="characters" keyboardType={useRecovery?'default':'number-pad'} maxLength={useRecovery?11:6} textContentType="oneTimeCode" className="border border-border rounded-xl p-4 text-foreground" />
    <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:loading,busy:loading}} disabled={loading} className="rounded-xl bg-accent p-4 items-center" onPress={async()=>{setLoading(true);try{await verifySecondFactor(factorCode,useRecovery);}catch{Alert.alert(t('mfaTitle'),t('mfaFailed'));}finally{setLoading(false);}}}><Text className="text-white">{t(loading?'mfaVerifying':'mfaVerify')}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={()=>{setUseRecovery(!useRecovery);setFactorCode('');}}><Text className="text-accent">{t(useRecovery?'useAuthenticator':'useRecovery')}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={()=>{setFactorCode('');void logout();}}><Text className="text-muted-foreground">{t('mfaCancel')}</Text></TouchableOpacity>
  </SafeAreaView>;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <LocaleSwitcher/>
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
                {t('tagline')}
              </Text>
            </View>

            <View className="gap-4">
              {isSupabaseMode?<TouchableOpacity accessibilityRole="button" accessibilityLabel={t('continueWithGoogle')} accessibilityState={{disabled:loading,busy:loading}}
                onPress={signInWithGoogleSupabase}
                disabled={loading}
                className="bg-white border border-border rounded-xl py-4 flex-row items-center justify-center gap-3 shadow-sm"
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#1a1a1a" />
                ) : (
                  <>
                    <Text className="text-2xl font-bold text-[#4285F4]">G</Text>
                    <Text className="font-semibold text-foreground text-base">{t('continueWithGoogle')}</Text>
                  </>
                )}
              </TouchableOpacity>:GOOGLE_CLIENT_ID?<DirectGoogleButton onLogin={async token=>{setLoading(true);try{await loginWithGoogleToken(token);}finally{setLoading(false);}}} disabled={loading||captchaOpen}/>:null}

              {/* Email / password — only in DO mode */}
              {!isSupabaseMode && (
                <>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1 h-px bg-border" />
                    <Text className="text-muted-foreground text-xs">{t('orContinueWith')}</Text>
                    <View className="flex-1 h-px bg-border" />
                  </View>

                  {/* Tab switcher */}
                  <View className="flex-row border border-border rounded-xl overflow-hidden">
                    {(['login', 'signup'] as const).map((value) => (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setTab(value)}
                        accessibilityRole="button"
                        accessibilityState={{selected:tab===value,disabled:loading||captchaOpen}}
                        disabled={loading||captchaOpen}
                        className={`flex-1 py-3 items-center ${tab === value ? 'bg-accent' : 'bg-transparent'}`}
                        activeOpacity={0.8}
                      >
                        <Text className={`font-semibold capitalize ${tab === value ? 'text-white' : 'text-muted-foreground'}`}>
                          {t(value==='login'?'signIn':'createAccount')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput
                    className="border border-border rounded-xl px-4 py-3.5 text-foreground bg-muted"
                    editable={!loading&&!captchaOpen}
                    maxLength={254}
                    placeholder={t('email')}
                    accessibilityLabel={t('email')}
                    placeholderTextColor="#6b7280"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={setEmail}
                  />
                  <TextInput
                    className="border border-border rounded-xl px-4 py-3.5 text-foreground bg-muted"
                    editable={!loading&&!captchaOpen}
                    maxLength={72}
                    placeholder={t('password')}
                    accessibilityLabel={t('password')}
                    placeholderTextColor="#6b7280"
                    secureTextEntry
                    textContentType={tab === 'signup' ? 'newPassword' : 'password'}
                    value={password}
                    onChangeText={setPassword}
                  />

                  <TouchableOpacity
                    accessibilityLabel={t(tab==='login'?'signIn':'createAccount')} onPress={()=>void handleEmailAuth()}
                    disabled={loading||captchaOpen||authConfig.isPending||authConfig.isError}
                    accessibilityRole="button"
                    accessibilityState={{disabled:loading||captchaOpen||authConfig.isPending||authConfig.isError,busy:loading}}
                    className="bg-accent rounded-xl py-4 items-center"
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="font-semibold text-white text-base">
                        {t(tab==='login'?'signIn':'createAccount')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {!isSupabaseMode&&authConfig.isError&&<><Text className="text-destructive">{t('captchaUnavailable')}</Text><TouchableOpacity accessibilityRole="button" onPress={()=>void authConfig.refetch()}><Text className="text-accent">{t('captchaRetry')}</Text></TouchableOpacity></>}
              <Text className="text-center text-xs text-muted-foreground px-4">
                {t('terms')}
              </Text>
              <TouchableOpacity accessibilityRole="link" disabled={loading} onPress={()=>void WebBrowser.openBrowserAsync(`${API_BASE}/account/recover`).catch(()=>Alert.alert(emailSecurity('recover'),emailSecurity('requestFailed')))}><Text className="text-center text-accent">{emailSecurity('recover')}</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <HCaptchaChallenge visible={captchaOpen} onClose={()=>{pendingForm.current=null;setCaptchaOpen(false);}} onProof={token=>{const form=pendingForm.current;pendingForm.current=null;setCaptchaOpen(false);if(form)void submitCredentials(form,token);}}/>
    </SafeAreaView>
  );
}

function DirectGoogleButton({onLogin,disabled}:{onLogin:(token:string)=>Promise<void>;disabled:boolean}){
  const {t}=useTranslations('auth');
  const [loading,setLoading]=useState(false);
  const [request,,prompt]=Google.useIdTokenAuthRequest({androidClientId:GOOGLE_CLIENT_ID,scopes:['openid','profile','email']});
  async function login(){
    setLoading(true);
    try{
      const result=await prompt();
      if(result.type!=='success')return;
      const token=result.params.id_token??result.authentication?.idToken;
      if(!token)throw new Error('No ID token from Google');
      await onLogin(token);
    }catch(error){Alert.alert(t('signIn'),t(error instanceof ApiError&&error.code==='ACCOUNT_LINK_REQUIRED'?'accountLinkRequired':'signInFailed'));}finally{setLoading(false);}
  }
  return <TouchableOpacity onPress={()=>void login()} disabled={disabled||loading||!request} accessibilityRole="button" accessibilityLabel={t('continueWithGoogle')} accessibilityState={{disabled:disabled||loading||!request,busy:loading}} className="bg-white border border-border rounded-xl py-4 flex-row items-center justify-center gap-3 shadow-sm">
    {loading?<ActivityIndicator color="#1a1a1a" />:<Text className="font-semibold text-foreground text-base">{t('continueWithGoogle')}</Text>}
  </TouchableOpacity>;
}

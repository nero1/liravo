import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {useTranslations} from '@/hooks/useTranslations';
import { GENRES, type UserType,type UserRow } from '@/types';

const USER_TYPES: {value:UserType;icon:string}[]=[{value:'reader',icon:'📖'},{value:'author',icon:'✍️'},{value:'newbie_writer',icon:'🌱'},{value:'creator',icon:'🎙️'}];

const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const router = useRouter();
  const {t}=useTranslations('onboarding'),{t:ai}=useTranslations('aiProfiles');
  const { user,setUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  function toggleType(type: UserType) {
    setUserTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }

  async function validateUsername() {
    const trimmed = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(trimmed)) {
      setUsernameError(t('username.invalid'));
      return;
    }
    setUsernameError('');setLoading(true);
    try{const result=await api.get<{available:boolean}>('/api/users/username',{value:trimmed});if(!result.available){setUsernameError(t('username.taken'));return;}setUsername(trimmed);setStep(2);}catch{setUsernameError(t('saveFailed'));}finally{setLoading(false);}
  }

  async function finish() {
    if (selectedGenres.length < 5) {
      Alert.alert(t('errorTitle'),t('genres.error'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.put<{ user: UserRow }>('/api/users/profile', {
        username: username.trim().toLowerCase(),
        user_types: userTypes.length ? userTypes : ['reader'],
        genres: selectedGenres,
        onboarding_complete: true,
      },user?.id?{'X-Liravo-Actor':user.id}:undefined);
      setUser(res.user);
      router.replace('/(tabs)/feed');
    } catch {
      Alert.alert(t('errorTitle'),t('saveFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Progress */}
        <View className="px-6 pt-4">
          <View className="flex-row gap-1.5 mb-6">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                className={`h-1 flex-1 rounded-full ${i < step ? 'bg-accent' : 'bg-muted'}`}
              />
            ))}
          </View>
        </View>

        <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
          {step === 1 && (
            <View className="gap-5">
              <View>
                <Text className="text-2xl font-bold text-foreground">{t('username.title')}</Text>
                <Text className="text-muted-foreground mt-1">{t('usernameDescription')}</Text>
              </View>
              <Input
                label={t('username.label')}
                value={username}
                onChangeText={setUsername}
                error={usernameError}
                placeholder={t('username.placeholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {step === 2 && (
            <View className="gap-5">
              <View>
                <Text className="text-2xl font-bold text-foreground">{t('userType.title')}</Text>
                <Text className="text-muted-foreground mt-1">{t('userType.subtitle')}</Text>
              </View>
              <View className="gap-3">
                {USER_TYPES.map(({ value, icon }) => {
                  const selected = userTypes.includes(value);
                  return (
                    <TouchableOpacity
                      key={value}
                      accessibilityRole="checkbox" accessibilityState={{checked:selected,disabled:loading}} disabled={loading}
                      onPress={() => toggleType(value)}
                      className={`border rounded-xl p-4 ${selected ? 'border-accent bg-accent/10' : 'border-border bg-card'}`}
                      activeOpacity={0.7}
                    >
                      <Text className={`font-semibold ${selected ? 'text-accent' : 'text-foreground'}`}>{icon} {t(`userType.${value}`)}</Text>
                      <Text className="text-sm text-muted-foreground mt-0.5">{t(`roleDescriptions.${value}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step === 3 && (
            <View className="gap-5">
              <View>
                <Text className="text-2xl font-bold text-foreground">{t('genres.title')}</Text>
                <Text className="text-muted-foreground mt-1">
                  {t('genres.selected',{count:selectedGenres.length})}.
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {GENRES.map((genre) => {
                  const selected = selectedGenres.includes(genre);
                  return (
                    <TouchableOpacity
                      key={genre}
                      accessibilityRole="checkbox" accessibilityState={{checked:selected,disabled:loading}} disabled={loading}
                      onPress={() => toggleGenre(genre)}
                      className={`border rounded-full px-4 py-2 ${selected ? 'border-accent bg-accent' : 'border-border bg-card'}`}
                      activeOpacity={0.7}
                    >
                      <Text className={`text-sm font-medium ${selected ? 'text-accent-foreground' : 'text-foreground'}`}>
                        {ai(`genreLabels.${genre}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step === 4 && (
            <View className="gap-5">
              <View>
                <Text className="text-2xl font-bold text-foreground">{t('ready')}</Text>
                <Text className="text-muted-foreground mt-1">
                  {t('readyDescription')}
                </Text>
              </View>
              <View className="bg-accent/10 border border-accent/30 rounded-xl p-4 gap-2">
                <Text className="font-semibold text-foreground">{t('username.label')}: @{username}</Text>
                <Text className="text-foreground">{t('userType.title')}: {userTypes.map(type=>t(`userType.${type}`)).join(', ')}</Text>
                <Text className="text-foreground">{t('genres.selected',{count:selectedGenres.length})}</Text>
              </View>
            </View>
          )}

          <View className="h-8" />
        </ScrollView>

        <View className="px-6 pb-6 gap-3">
          <Button
            onPress={step === 1 ? validateUsername : step < TOTAL_STEPS ? () => setStep(step + 1) : finish}
            loading={loading}
            disabled={step===2&&!userTypes.length||step===3&&selectedGenres.length<5}
            size="lg"
          >
            {step < TOTAL_STEPS ? t('continue') : t('finish')}
          </Button>
          {step > 1 && (
            <Button disabled={loading} onPress={() => setStep(step - 1)} variant="ghost" size="md">
              {t('back')}
            </Button>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

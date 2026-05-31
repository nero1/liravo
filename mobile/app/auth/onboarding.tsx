import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GENRES, type UserType } from '@/types';

const USER_TYPES: { value: UserType; label: string; description: string }[] = [
  { value: 'reader', label: '📖 Reader', description: 'I love discovering and reading books' },
  { value: 'author', label: '✍️ Author', description: 'I write and publish books' },
  { value: 'newbie_writer', label: '🌱 Newbie Writer', description: 'I am learning to write' },
  { value: 'creator', label: '🎙️ Creator', description: 'I create book content online' },
];

const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const router = useRouter();
  const { setUser } = useAuthStore();
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
      setUsernameError('3-30 chars, letters, numbers and _ only');
      return;
    }
    setUsernameError('');
    setStep(2);
  }

  async function finish() {
    if (selectedGenres.length < 5) {
      Alert.alert('Select more genres', 'Please pick at least 5 genres.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.put<{ user: any }>('/api/users/profile', {
        username: username.trim().toLowerCase(),
        user_types: userTypes.length ? userTypes : ['reader'],
        genres: selectedGenres,
        onboarding_complete: true,
      });
      setUser(res.user);
      router.replace('/(tabs)/feed');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
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
                <Text className="text-2xl font-bold text-foreground">Choose your username</Text>
                <Text className="text-muted-foreground mt-1">This is how others will find you.</Text>
              </View>
              <Input
                label="Username"
                value={username}
                onChangeText={setUsername}
                error={usernameError}
                placeholder="e.g. bookworm_42"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {step === 2 && (
            <View className="gap-5">
              <View>
                <Text className="text-2xl font-bold text-foreground">I am a...</Text>
                <Text className="text-muted-foreground mt-1">Select all that apply.</Text>
              </View>
              <View className="gap-3">
                {USER_TYPES.map(({ value, label, description }) => {
                  const selected = userTypes.includes(value);
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => toggleType(value)}
                      className={`border rounded-xl p-4 ${selected ? 'border-accent bg-accent/10' : 'border-border bg-card'}`}
                      activeOpacity={0.7}
                    >
                      <Text className={`font-semibold ${selected ? 'text-accent' : 'text-foreground'}`}>{label}</Text>
                      <Text className="text-sm text-muted-foreground mt-0.5">{description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step === 3 && (
            <View className="gap-5">
              <View>
                <Text className="text-2xl font-bold text-foreground">Pick your genres</Text>
                <Text className="text-muted-foreground mt-1">
                  Choose at least 5 — {selectedGenres.length} selected.
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {GENRES.map((genre) => {
                  const selected = selectedGenres.includes(genre);
                  return (
                    <TouchableOpacity
                      key={genre}
                      onPress={() => toggleGenre(genre)}
                      className={`border rounded-full px-4 py-2 ${selected ? 'border-accent bg-accent' : 'border-border bg-card'}`}
                      activeOpacity={0.7}
                    >
                      <Text className={`text-sm font-medium ${selected ? 'text-accent-foreground' : 'text-foreground'}`}>
                        {genre}
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
                <Text className="text-2xl font-bold text-foreground">You're all set! 🎉</Text>
                <Text className="text-muted-foreground mt-1">
                  Welcome to Liravo, {username}. Start discovering books.
                </Text>
              </View>
              <View className="bg-accent/10 border border-accent/30 rounded-xl p-4 gap-2">
                <Text className="font-semibold text-foreground">📖 Username: @{username}</Text>
                <Text className="text-foreground">👤 Types: {userTypes.join(', ') || 'reader'}</Text>
                <Text className="text-foreground">🎭 Genres: {selectedGenres.length} selected</Text>
              </View>
            </View>
          )}

          <View className="h-8" />
        </ScrollView>

        <View className="px-6 pb-6 gap-3">
          <Button
            onPress={step === 1 ? validateUsername : step < TOTAL_STEPS ? () => setStep(step + 1) : finish}
            loading={loading}
            size="lg"
          >
            {step < TOTAL_STEPS ? 'Continue' : 'Start Reading'}
          </Button>
          {step > 1 && (
            <Button onPress={() => setStep(step - 1)} variant="ghost" size="md">
              Back
            </Button>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

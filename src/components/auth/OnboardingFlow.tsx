'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GENRES, USER_TYPES, USER_TYPE_LABELS } from '@/constants/config';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface OnboardingFlowProps {
  userId: string;
  initialUsername: string;
  initialDisplayName: string;
}

type Step = 'username' | 'user_type' | 'genres';

export function OnboardingFlow({ userId, initialUsername, initialDisplayName }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [userTypes, setUserTypes] = useState<string[]>(['reader']);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validateUsername = (val: string) => /^[a-zA-Z0-9_]{3,30}$/.test(val);

  const handleUsernameNext = async () => {
    if (!validateUsername(username)) {
      setError('Username must be 3–30 characters, letters, numbers, and underscores only.');
      return;
    }
    setError(null);

    const supabase = createClient();
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .neq('id', userId)
      .single();

    if (data) {
      setError('This username is already taken. Please choose another.');
      return;
    }
    setStep('user_type');
  };

  const toggleUserType = (type: string) => {
    setUserTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleFinish = async () => {
    if (selectedGenres.length < 5) {
      setError('Please select at least 5 genres.');
      return;
    }
    setError(null);
    setSaving(true);

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from('users')
      .update({
        username,
        display_name: displayName || username,
        user_types: userTypes,
        genres: selectedGenres,
        onboarding_complete: true,
      })
      .eq('id', userId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    // Create default shelves
    await supabase.from('shelves').insert([
      { user_id: userId, name: 'Currently Reading', slug: 'currently-reading', is_default: true, default_type: 'currently_reading' },
      { user_id: userId, name: 'Have Read', slug: 'have-read', is_default: true, default_type: 'have_read' },
      { user_id: userId, name: 'Want to Read', slug: 'want-to-read', is_default: true, default_type: 'want_to_read' },
    ]);

    router.push('/');
    router.refresh();
  };

  return (
    <div className="w-full max-w-lg">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {(['username', 'user_type', 'genres'] as Step[]).map((s) => (
          <div
            key={s}
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-colors',
              s === step ? 'bg-accent' : 'bg-border'
            )}
          />
        ))}
      </div>

      {/* Step: Username */}
      {step === 'username' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">Choose your username</h1>
            <p className="text-muted-foreground text-sm">This is how other readers will find you</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="yourname"
                  className="w-full pl-7 pr-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
                  maxLength={30}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Letters, numbers, and underscores. 3–30 characters.</p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            onClick={handleUsernameNext}
            className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Step: User Type */}
      {step === 'user_type' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">How do you describe yourself?</h1>
            <p className="text-muted-foreground text-sm">Select all that apply</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {USER_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleUserType(type)}
                className={cn(
                  'p-4 rounded-lg border-2 text-start transition-all',
                  userTypes.includes(type)
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm">{USER_TYPE_LABELS[type]}</span>
                  {userTypes.includes(type) && (
                    <Check size={16} className="text-accent flex-shrink-0 mt-0.5" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('username')}
              className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => { setError(null); setStep('genres'); }}
              className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
              disabled={userTypes.length === 0}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step: Genres */}
      {step === 'genres' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">What do you love to read?</h1>
            <p className="text-muted-foreground text-sm">
              Pick at least 5 genres — {selectedGenres.length} selected
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <button
                key={genre}
                onClick={() => toggleGenre(genre)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                  selectedGenres.includes(genre)
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border hover:border-muted-foreground text-muted-foreground hover:text-foreground'
                )}
              >
                {genre}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('user_type')}
              className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleFinish}
              disabled={saving || selectedGenres.length < 5}
              className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
              {saving ? 'Setting up...' : 'Get started'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

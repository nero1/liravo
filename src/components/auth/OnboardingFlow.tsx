'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GENRES, USER_TYPES, USER_TYPE_LABELS } from '@/constants/config';
import { cn } from '@/lib/utils';
import { Check, Upload } from 'lucide-react';

interface OnboardingFlowProps {
  userId: string;
  initialUsername: string;
  initialDisplayName: string;
}

type Step = 'username' | 'user_type' | 'genres' | 'import' | 'pin';

const STEPS: Step[] = ['username', 'user_type', 'genres', 'import', 'pin'];

export function OnboardingFlow({ userId, initialUsername, initialDisplayName }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [userTypes, setUserTypes] = useState<string[]>(['reader']);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Import step state
  const fileRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // PIN step state
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  // Honeypot: bots fill this, humans don't see it
  const [honeypot, setHoneypot] = useState('');

  const validateUsername = (val: string) => /^[a-zA-Z0-9_]{3,30}$/.test(val);

  const handleUsernameNext = async () => {
    // Honeypot check — if filled, silently reject (bots shouldn't get an error signal)
    if (honeypot) {
      setStep('user_type');
      return;
    }
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

  const toggleUserType = (type: string) =>
    setUserTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );

  const toggleGenre = (genre: string) =>
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );

  const handleImport = async () => {
    if (!importFile) { setStep('pin'); return; }
    setImporting(true);
    setImportMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/import/goodreads', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({})) as { imported?: number; message?: string; error?: string };
      if (res.ok) {
        setImportDone(true);
        setImportMessage(data.message ?? `Imported ${data.imported ?? 0} books successfully.`);
      } else {
        setImportMessage(data.error ?? 'Import failed — you can try again from Settings later.');
      }
    } catch {
      setImportMessage('Import failed — you can try again from Settings later.');
    }
    setImporting(false);
  };

  const handleFinish = async () => {
    // Validate PIN if provided
    if (pin) {
      if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        setError('PIN must be exactly 4 digits.');
        return;
      }
      if (pin !== pinConfirm) {
        setError('PINs do not match.');
        return;
      }
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

    // Save PIN if set
    if (pin) {
      await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
    }

    router.push('/');
    router.refresh();
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="w-full max-w-lg">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              'h-2 rounded-full transition-all',
              i === stepIndex ? 'w-6 bg-accent' : i < stepIndex ? 'w-2 bg-accent/50' : 'w-2 bg-border'
            )}
          />
        ))}
      </div>

      {/* Step: Username */}
      {step === 'username' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">Welcome to Liravo</h1>
            <p className="text-muted-foreground text-sm">Let&apos;s set up your profile</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={80}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
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

          {/* Honeypot — hidden from real users, bots fill it */}
          <input
            type="text"
            name="website"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
          />

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
                  {userTypes.includes(type) && <Check size={16} className="text-accent flex-shrink-0 mt-0.5" />}
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('username')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">Back</button>
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
            <p className="text-muted-foreground text-sm">Pick at least 5 genres — {selectedGenres.length} selected</p>
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
            <button onClick={() => setStep('user_type')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">Back</button>
            <button
              onClick={() => { if (selectedGenres.length < 5) { setError('Please select at least 5 genres.'); return; } setError(null); setStep('import'); }}
              disabled={selectedGenres.length < 5}
              className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step: Goodreads Import */}
      {step === 'import' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">Import your reading history</h1>
            <p className="text-muted-foreground text-sm">
              Optional. Upload your Goodreads export to pre-fill your shelves.
            </p>
          </div>

          {!importDone ? (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
              >
                <Upload size={24} className="text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium text-sm">{importFile ? importFile.name : 'Click to upload CSV'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Export from Goodreads → My Books → Import/Export</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {importMessage && (
                <p className="text-sm text-muted-foreground">{importMessage}</p>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep('genres')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">Back</button>
                <button
                  onClick={importFile ? handleImport : () => setStep('pin')}
                  disabled={importing}
                  className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
                >
                  {importing ? 'Importing…' : importFile ? 'Import and continue' : 'Skip'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-700 dark:text-green-400">
                {importMessage}
              </div>
              <button
                onClick={() => setStep('pin')}
                className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {/* Step: PIN (optional) */}
      {step === 'pin' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">Set a security PIN</h1>
            <p className="text-muted-foreground text-sm">
              Optional. A 4-digit PIN adds extra protection for sensitive actions like payouts.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
            {pin.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep('import')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">Back</button>
            <button
              onClick={handleFinish}
              disabled={saving || (pin.length > 0 && pin.length < 4)}
              className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
              {saving ? 'Setting up…' : pin ? 'Finish with PIN' : 'Skip and finish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

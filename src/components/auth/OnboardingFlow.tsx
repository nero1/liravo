'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {useTranslations} from 'next-intl';
import { GENRES, USER_TYPES } from '@/constants/config';
import { cn } from '@/lib/utils';
import { Check, Upload, UserPlus } from 'lucide-react';
import Image from 'next/image';

interface OnboardingFlowProps {
  actorId:string;
  initialUsername: string;
  initialDisplayName: string;
}

type Step = 'username' | 'user_type' | 'genres' | 'import' | 'follow' | 'pin';

const STEPS: Step[] = ['username', 'user_type', 'genres', 'import', 'follow', 'pin'];

export function OnboardingFlow({ actorId,initialUsername, initialDisplayName }: OnboardingFlowProps) {
  const router = useRouter();
  const t=useTranslations('onboarding'),ai=useTranslations('aiProfiles'),imports=useTranslations('goodreadsImport');
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

  // Suggested follows step state
  interface SuggestedUser { id: string; display_name: string; username: string; avatar_url: string | null; is_verified_author: boolean; }
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  // Honeypot: bots fill this, humans don't see it
  const [honeypot, setHoneypot] = useState('');

  const validateUsername = (val: string) => /^[a-zA-Z0-9_]{3,30}$/.test(val);

  const handleUsernameNext=async()=>{
    if(saving)return;
    if(honeypot){setStep('user_type');return;}
    if(!validateUsername(username)){setError(t('username.invalid'));return;}
    if(!displayName.trim()||displayName.trim().length>50){setError(t('displayRequired'));return;}
    setError(null);setSaving(true);
    try{
      const response=await fetch('/api/users/username?value='+encodeURIComponent(username));
      if(!response.ok)throw new Error('Username unavailable');
      const data=await response.json();if(!data.available){setError(t('username.taken'));return;}
      setStep('user_type');
    }catch{setError(t('saveFailed'));}finally{setSaving(false);}
  };

  const toggleUserType = (type: string) =>
    setUserTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );

  const toggleGenre = (genre: string) =>
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );

  const loadSuggestedUsers = async () => {
    setLoadingSuggested(true);
    try {
      const res = await fetch('/api/users/suggested');
      if (res.ok) {
        const data = await res.json() as { users?: SuggestedUser[] };
        setSuggestedUsers(data.users ?? []);
      }
    } catch { /* non-critical */ }
    setLoadingSuggested(false);
  };

  const handleFollowToggle=async(targetId:string)=>{
    if(saving)return;setSaving(true);setError(null);
    const isFollowing=followedIds.has(targetId);
    try{
      const response=await fetch('/api/follows',{method:isFollowing?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target_user_id:targetId})});
      if(!response.ok)throw new Error('Follow unavailable');await response.json();
      setFollowedIds(previous=>{const next=new Set(previous);if(isFollowing)next.delete(targetId);else next.add(targetId);return next;});
    }catch{setError(t('followFailed'));}finally{setSaving(false);}
  };

  const handleImport = async () => {
    if (!importFile) { setLoadingSuggested(true); loadSuggestedUsers(); setStep('follow'); return; }
    if(importFile.size>2_000_000){setImportMessage(imports('size'));return;}
    setImporting(true);
    setImportMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/import/goodreads', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({})) as { imported?: number;skipped?:number; error?: string };
      if (res.ok) {
        setImportDone(true);
        setImportMessage(imports('result',{imported:data.imported??0,skipped:data.skipped??0}));
      } else {
        setImportMessage(imports('failed'));
      }
    } catch {
      setImportMessage(imports('network'));
    }
    setImporting(false);
  };

  const handleFinish=async()=>{
    if(saving)return;
    if(pin&&(!/^\d{4}$/.test(pin)||pin!==pinConfirm)){setError(t(pin===pinConfirm?'pinInvalid':'pinMismatch'));return;}
    setError(null);setSaving(true);
    try{
      const response=await fetch('/api/users/profile',{method:'PUT',headers:{'Content-Type':'application/json','X-Liravo-Actor':actorId},body:JSON.stringify({username,display_name:displayName.trim()||username,user_types:userTypes,genres:selectedGenres,onboarding_complete:true,...(pin?{pin}:{})})});
      const data=await response.json();
      if(!response.ok){if(data.code==='USERNAME_TAKEN'){setStep('username');setError(t('username.taken'));return;}throw new Error('Profile unavailable');}
      router.push('/');router.refresh();
    }catch{setError(t('saveFailed'));}finally{setSaving(false);}
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <fieldset disabled={saving||importing} className="w-full max-w-lg" aria-busy={saving||importing}>
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
            <h1 className="font-display text-2xl font-bold mb-2">{t('welcome')}</h1>
            <p className="text-muted-foreground text-sm">{t('title')}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="onboard-display" className="block text-sm font-medium mb-1.5">{t('displayName')}</label>
              <input
                type="text"
                id="onboard-display" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('displayPlaceholder')}
                maxLength={50}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
            <div>
              <label htmlFor="onboard-username" className="block text-sm font-medium mb-1.5">{t('username.label')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <input
                  type="text"
                  id="onboard-username" value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder={t('username.placeholder')}
                  className="w-full pl-7 pr-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50"
                  maxLength={30}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('username.hint')}</p>
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

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <button
            onClick={handleUsernameNext}
            className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
          >
            {t('next')}
          </button>
        </div>
      )}

      {/* Step: User Type */}
      {step === 'user_type' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">{t('userType.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('userType.subtitle')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {USER_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleUserType(type)}
                aria-pressed={userTypes.includes(type)}
                className={cn(
                  'p-4 rounded-lg border-2 text-start transition-all',
                  userTypes.includes(type)
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm">{t(`userType.${type}`)}</span>
                  {userTypes.includes(type) && <Check size={16} className="text-accent flex-shrink-0 mt-0.5" />}
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('username')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">{t('back')}</button>
            <button
              onClick={() => { setError(null); setStep('genres'); }}
              className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
              disabled={userTypes.length === 0}
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}

      {/* Step: Genres */}
      {step === 'genres' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">{t('genres.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('genres.selected',{count:selectedGenres.length})}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <button
                key={genre}
                onClick={() => toggleGenre(genre)}
                aria-pressed={selectedGenres.includes(genre)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                  selectedGenres.includes(genre)
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border hover:border-muted-foreground text-muted-foreground hover:text-foreground'
                )}
              >
                {ai(`genreLabels.${genre}`)}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep('user_type')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">{t('back')}</button>
            <button
              onClick={() => { if (selectedGenres.length < 5) { setError(t('genres.error')); return; } setError(null); setStep('import'); }}
              disabled={selectedGenres.length < 5}
              className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}

      {/* Step: Goodreads Import */}
      {step === 'import' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">{t('importTitle')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('importDescription')}
            </p>
          </div>

          {!importDone ? (
            <>
              <div
                role="button" tabIndex={0} aria-label={imports('choose')}
                onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();fileRef.current?.click();}}}
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
              >
                <Upload size={24} className="text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium text-sm">{importFile ? importFile.name : imports('choose')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('importHelp')}</p>
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
                <button onClick={() => setStep('genres')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">{t('back')}</button>
                <button
                  onClick={importFile ? handleImport : () => { loadSuggestedUsers(); setStep('follow'); }}
                  disabled={importing}
                  className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
                >
                  {importing ? imports('importing') : importFile ? t('importContinue') : t('skip')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-700 dark:text-green-400">
                {importMessage}
              </div>
              <button
                onClick={() => { loadSuggestedUsers(); setStep('follow'); }}
                className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
              >
                {t('continue')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Step: Suggested Follows */}
      {step === 'follow' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">{t('followTitle')}</h1>
            <p className="text-muted-foreground text-sm">{t('followDescription')}</p>
          </div>

          {loadingSuggested ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                  <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 bg-muted rounded animate-pulse w-24" />
                    <div className="h-2.5 bg-muted rounded animate-pulse w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : suggestedUsers.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {suggestedUsers.map((su) => (
                <div key={su.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                    {su.avatar_url ? (
                      <Image src={su.avatar_url} alt={su.display_name} width={40} height={40} className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-accent/20 flex items-center justify-center text-sm font-bold text-accent">
                        {su.display_name[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{su.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{su.username}{su.is_verified_author ? ' · '+t('verifiedAuthor') : ''}</p>
                  </div>
                  <button
                    onClick={() => handleFollowToggle(su.id)}
                    disabled={saving}
                    aria-pressed={followedIds.has(su.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex-shrink-0',
                      followedIds.has(su.id)
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border hover:border-accent text-muted-foreground hover:text-accent'
                    )}
                  >
                    <UserPlus size={12} />
                    {followedIds.has(su.id) ? t('following') : t('follow')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground text-sm py-6">{t('noSuggestions')}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('import')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">{t('back')}</button>
            <button
              onClick={() => setStep('pin')}
              className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              {followedIds.size > 0 ? t('continueFollowed',{count:followedIds.size}) : t('skip')}
            </button>
          </div>
        </div>
      )}

      {step==='follow'&&error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {/* Step: PIN (optional) */}
      {step === 'pin' && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-2">{t('pinTitle')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('pinDescription')}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="onboard-pin" className="block text-sm font-medium mb-1.5">{t('pin')}</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                id="onboard-pin" value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
            {pin.length > 0 && (
              <div>
                <label htmlFor="onboard-pin-confirm" className="block text-sm font-medium mb-1.5">{t('confirmPin')}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  id="onboard-pin-confirm" value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
            )}
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep('follow')} className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors">{t('back')}</button>
            <button
              onClick={handleFinish}
              disabled={saving || (pin.length > 0 && pin.length < 4)}
              className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
              {saving ? t('settingUp') : pin ? t('finishPin') : t('skipFinish')}
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}

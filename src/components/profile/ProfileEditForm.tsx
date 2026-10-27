'use client';

import { useState,useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicUserRow } from '@/lib/user-profile';
import { useTranslations } from 'next-intl';
import { USER_TYPES,GENRES,type UserType } from '@/constants/config';
import { cn } from '@/lib/utils';

interface ProfileEditFormProps {
  profile: PublicUserRow;
}

export function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const router = useRouter();
  const t=useTranslations('aiProfiles'),p=useTranslations('profile');
  const [genres,setGenres]=useState<string[]>(profile.genres);
  const [roles,setRoles]=useState<UserType[]>(profile.user_types.filter((value):value is UserType=>USER_TYPES.includes(value as UserType)));
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [country, setCountry] = useState(profile.country ?? '');
  const [links, setLinks] = useState<string[]>(profile.external_links.slice(0, 3));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(()=>()=>{if(avatarPreview?.startsWith('blob:'))URL.revokeObjectURL(avatarPreview);},[avatarPreview]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(p('avatarTooLarge'));
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if(genres.length<5){setError(t('genresRequired'));return;}
    if(!roles.length){setError(t('rolesRequired'));return;}
    if (!displayName.trim()) { setError(p('displayRequired')); return; }
    if (bio.length > 280) { setError(p('bioTooLong')); return; }
    setSaving(true);
    setError(null);

    try{
      let avatarUrl=profile.avatar_url;
      if(avatarFile){
        const data=new FormData();data.append('file',avatarFile);
        const response=await fetch('/api/users/avatar',{method:'POST',headers:{'X-Liravo-Actor':profile.id},body:data});
        if(!response.ok)throw new Error('Avatar unavailable');const result=await response.json();avatarUrl=result.publicUrl;
      }
      const response=await fetch('/api/users/profile',{method:'PUT',headers:{'Content-Type':'application/json','X-Liravo-Actor':profile.id},body:JSON.stringify({display_name:displayName.trim(),bio:bio.trim()||null,country:country.trim()||null,avatar_url:avatarUrl,external_links:links.filter(Boolean),user_types:roles,genres})});
      if(!response.ok)throw new Error('Profile unavailable');
      await response.json();router.push('/profile');router.refresh();
    }catch{setError(p('saveFailed'));}finally{setSaving(false);}
  };

  return (
    <fieldset disabled={saving} aria-busy={saving} className="space-y-5">
      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium mb-2">{p('photo')}</label>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex-shrink-0">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt={p('preview')} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl font-bold text-muted-foreground">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <label className="cursor-pointer px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
            {p('uploadPhoto')}
            <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </label>
        </div>
      </div>

      {/* {p('displayName')} */}
      <div>
        <label className="block text-sm font-medium mb-1.5">{p('displayName')}</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
        />
      </div>

      <fieldset className="space-y-2"><legend className="block text-sm font-medium">{t('rolesTitle')}</legend>
        {USER_TYPES.map(role=><label key={role} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roles.includes(role)} onChange={()=>setRoles(current=>current.includes(role)?current.filter(value=>value!==role):[...current,role])} />{t(`roles.${role}`)}</label>)}
      </fieldset>
      <fieldset className="space-y-2"><legend className="block text-sm font-medium">{t('genresTitle')}</legend><div className="flex flex-wrap gap-2">
        {GENRES.map(genre=><label key={genre} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={genres.includes(genre)} onChange={()=>setGenres(current=>current.includes(genre)?current.filter(value=>value!==genre):[...current,genre])} />{t(`genreLabels.${genre}`)}</label>)}
      </div></fieldset>
      {/* Bio */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          {p('bio')} <span className="text-muted-foreground font-normal">({bio.length}/280)</span>
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm resize-none"
          placeholder={p('aboutPlaceholder')}
        />
      </div>

      {/* Country */}
      <div>
        <label className="block text-sm font-medium mb-1.5">{p('countryOptional')}</label>
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          maxLength={2}
          placeholder={p('countryPlaceholder')}
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm uppercase"
        />
      </div>

      {/* External links */}
      <div>
        <label className="block text-sm font-medium mb-1.5">{p('externalLinks')}</label>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              value={links[i] ?? ''}
              onChange={(e) => {
                const next = [...links];
                next[i] = e.target.value;
                setLinks(next);
              }}
              type="url"
              placeholder="https://yoursite.com"
              className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
            />
          ))}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors text-sm"
        >
          {p('cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium transition-colors text-sm',
            saving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-accent/90'
          )}
        >
          {saving ? p('saving') : p('saveChanges')}
        </button>
      </div>
    </fieldset>
  );
}

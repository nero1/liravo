'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { UserRow } from '@/types/database';
import { cn } from '@/lib/utils';

const isDirectPostgresMode = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER ?? 'supabase') !== 'supabase';

interface ProfileEditFormProps {
  profile: UserRow;
}

export function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [country, setCountry] = useState(profile.country ?? '');
  const [links, setLinks] = useState<string[]>(profile.external_links.slice(0, 3));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar must be under 5MB');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!displayName.trim()) { setError('Display name is required'); return; }
    if (bio.length > 280) { setError('Bio must be 280 characters or fewer'); return; }
    setSaving(true);
    setError(null);

    let avatarUrl = profile.avatar_url;

    if (avatarFile) {
      if (isDirectPostgresMode) {
        // Direct-postgres mode: upload via API endpoint that uses S3
        const fd = new FormData();
        fd.append('file', avatarFile);
        const res = await fetch('/api/users/avatar', { method: 'POST', body: fd });
        if (!res.ok) {
          setError('Failed to upload avatar');
          setSaving(false);
          return;
        }
        const { publicUrl } = await res.json();
        avatarUrl = publicUrl;
      } else {
        const supabase = createClient();
        const ext = avatarFile.name.split('.').pop();
        const path = `avatars/${profile.id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true });

        if (uploadError) {
          setError('Failed to upload avatar');
          setSaving(false);
          return;
        }

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = publicUrl;
      }
    }

    // Profile fields update goes through an API route in direct-postgres mode too
    if (isDirectPostgresMode) {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          country: country.trim() || null,
          avatar_url: avatarUrl,
          external_links: links.filter(Boolean),
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg ?? 'Failed to save');
        setSaving(false);
        return;
      }
      router.push('/profile');
      router.refresh();
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.from('users').update({
      display_name: displayName.trim(),
      bio: bio.trim() || null,
      country: country.trim() || null,
      avatar_url: avatarUrl,
      external_links: links.filter(Boolean),
    }).eq('id', profile.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    router.push('/profile');
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium mb-2">Profile photo</label>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex-shrink-0">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl font-bold text-muted-foreground">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <label className="cursor-pointer px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
            Upload photo
            <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </label>
        </div>
      </div>

      {/* Display name */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Bio <span className="text-muted-foreground font-normal">({bio.length}/280)</span>
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm resize-none"
          placeholder="Tell readers about yourself..."
        />
      </div>

      {/* Country */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Country (optional)</label>
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          maxLength={2}
          placeholder="US, GB, AU..."
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm uppercase"
        />
      </div>

      {/* External links */}
      <div>
        <label className="block text-sm font-medium mb-1.5">External links (up to 3)</label>
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium transition-colors text-sm',
            saving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-accent/90'
          )}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

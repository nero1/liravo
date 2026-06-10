'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface NotifPrefs {
  email_digest_enabled: boolean;
  notify_follows: boolean;
  notify_likes: boolean;
  notify_replies: boolean;
  notify_mentions: boolean;
  notify_author_announcements: boolean;
  notify_new_releases: boolean;
  notify_challenge_completions: boolean;
  notify_arc_grants: boolean;
}

const defaultPrefs: NotifPrefs = {
  email_digest_enabled: true,
  notify_follows: true,
  notify_likes: true,
  notify_replies: true,
  notify_mentions: true,
  notify_author_announcements: true,
  notify_new_releases: true,
  notify_challenge_completions: true,
  notify_arc_grants: true,
};

const PREF_LABELS: Record<keyof NotifPrefs, string> = {
  email_digest_enabled: 'Weekly email digest (paid tier)',
  notify_follows: 'New followers',
  notify_likes: 'Likes on my reviews',
  notify_replies: 'Replies to my reviews',
  notify_mentions: 'Mentions',
  notify_author_announcements: 'Announcements from authors I follow',
  notify_new_releases: 'New releases from authors I follow (email)',
  notify_challenge_completions: 'Challenge completion updates',
  notify_arc_grants: 'ARC application status',
};

const EMAIL_PREFS: Array<keyof NotifPrefs> = ['email_digest_enabled', 'notify_new_releases'];
const INAPP_PREFS: Array<keyof NotifPrefs> = [
  'notify_follows', 'notify_likes', 'notify_replies', 'notify_mentions',
  'notify_author_announcements', 'notify_challenge_completions', 'notify_arc_grants',
];

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/users/me')
      .then((r) => r.json())
      .then((d: { user?: Partial<NotifPrefs> }) => {
        if (d.user) {
          setPrefs((prev) => ({ ...prev, ...d.user }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await fetch('/api/users/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_digest_enabled: prefs.email_digest_enabled,
        notify_follows: prefs.notify_follows,
        notify_likes: prefs.notify_likes,
        notify_replies: prefs.notify_replies,
        notify_mentions: prefs.notify_mentions,
        notify_author_announcements: prefs.notify_author_announcements,
        notify_new_releases: prefs.notify_new_releases,
        notify_challenge_completions: prefs.notify_challenge_completions,
        notify_arc_grants: prefs.notify_arc_grants,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function toggle(key: keyof NotifPrefs) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-muted-foreground hover:underline">← Settings</Link>
        <h1 className="font-display text-2xl font-bold mt-2">Notification Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">Control which notifications you receive.</p>
      </div>

      <div className="space-y-6">
        {/* In-app notifications */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">In-app notifications</h2>
          <div className="space-y-1">
            {INAPP_PREFS.map((key) => (
              <label key={key} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/50 cursor-pointer">
                <span className="text-sm">{PREF_LABELS[key]}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[key]}
                  onClick={() => toggle(key)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${prefs[key] ? 'bg-accent' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${prefs[key] ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
            ))}
          </div>
        </section>

        {/* Email notifications */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Email notifications (paid tier)</h2>
          <div className="space-y-1">
            {EMAIL_PREFS.map((key) => (
              <label key={key} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/50 cursor-pointer">
                <span className="text-sm">{PREF_LABELS[key]}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[key]}
                  onClick={() => toggle(key)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${prefs[key] ? 'bg-accent' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${prefs[key] ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
            ))}
          </div>
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-semibold hover:bg-accent/90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}

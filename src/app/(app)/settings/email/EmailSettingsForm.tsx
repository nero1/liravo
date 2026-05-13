'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface EmailSettingsFormProps {
  currentEmail: string | null;
}

export default function EmailSettingsForm({ currentEmail }: EmailSettingsFormProps) {
  const [email, setEmail] = useState(currentEmail ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSave = async () => {
    if (!email.trim() || !email.includes('@')) {
      setMessage({ text: 'Please enter a valid email address', ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from('users')
      .update({ email: email.trim().toLowerCase() })
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '');

    setSaving(false);
    if (error) {
      setMessage({ text: error.message, ok: false });
    } else {
      setMessage({ text: 'Email saved for account recovery', ok: true });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Used only for account recovery. We won&apos;t send marketing emails unless you&apos;re on a premium plan.
        </p>
      </div>

      {message && (
        <p className={`text-sm ${message.ok ? 'text-accent' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-60"
      >
        {saving ? 'Saving...' : 'Save email'}
      </button>
    </div>
  );
}

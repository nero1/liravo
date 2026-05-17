'use client';

import { useState } from 'react';

interface EmailSettingsFormProps {
  currentEmail: string | null;
  isVerified: boolean;
}

export default function EmailSettingsForm({ currentEmail, isVerified }: EmailSettingsFormProps) {
  const [email, setEmail] = useState(currentEmail ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const isUnchanged = email === currentEmail;

  const handleSave = async () => {
    if (!email.trim() || !email.includes('@')) {
      setMessage({ text: 'Please enter a valid email address', ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);

    const res = await fetch('/api/users/send-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    setSaving(false);
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setMessage({ text: 'Verification email sent — check your inbox to confirm.', ok: true });
    } else {
      setMessage({ text: (data as { error?: string }).error ?? 'Failed to send verification email', ok: false });
    }
  };

  const handleResend = async () => {
    if (!currentEmail) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch('/api/users/send-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage({ text: 'Verification email resent.', ok: true });
    } else {
      setMessage({ text: 'Failed to resend — please try again.', ok: false });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5">Email address</label>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {currentEmail && isUnchanged && (
            <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${
              isVerified
                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }`}>
              {isVerified ? 'Verified' : 'Unverified'}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Used only for account recovery. Email notifications are available on paid plans only.
        </p>
      </div>

      {currentEmail && !isVerified && isUnchanged && (
        <div className="p-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm rounded-lg flex items-center justify-between gap-3">
          <span>Your email is not yet verified.</span>
          <button
            onClick={handleResend}
            disabled={saving}
            className="text-xs font-medium underline disabled:opacity-60"
          >
            Resend link
          </button>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || (isUnchanged && isVerified)}
        className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-60"
      >
        {saving ? 'Sending…' : isUnchanged && !isVerified ? 'Resend verification' : 'Save and verify email'}
      </button>
    </div>
  );
}

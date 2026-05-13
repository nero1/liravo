'use client';

import { useState } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Set PIN' };

export default function PINSettingsPage() {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSave = async () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setMessage({ text: 'PIN must be exactly 4 digits', ok: false });
      return;
    }
    if (pin !== confirm) {
      setMessage({ text: 'PINs do not match', ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch('/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage({ text: 'PIN set successfully', ok: true });
      setPin('');
      setConfirm('');
    } else {
      const data = await res.json();
      setMessage({ text: data.error ?? 'Failed to set PIN', ok: false });
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">4-Digit PIN</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Set an optional PIN for additional security on sensitive actions.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">New PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 tracking-widest text-center text-xl"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Confirm PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 tracking-widest text-center text-xl"
          />
        </div>

        {message && (
          <p className={`text-sm ${message.ok ? 'text-accent' : 'text-destructive'}`}>
            {message.text}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || pin.length !== 4}
          className="w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Set PIN'}
        </button>
      </div>
    </div>
  );
}

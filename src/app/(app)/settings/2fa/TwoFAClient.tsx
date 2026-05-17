'use client';

import { useState } from 'react';
import Image from 'next/image';

interface TwoFAClientProps {
  enabled: boolean;
}

type Phase = 'idle' | 'setup_qr' | 'verify' | 'recovery_codes' | 'disable';

export default function TwoFAClient({ enabled }: TwoFAClientProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(enabled);

  const startSetup = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/2fa/setup');
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? 'Failed to start setup');
      return;
    }
    const data = await res.json() as { secret: string; qrDataUrl: string };
    setSecret(data.secret);
    setQrDataUrl(data.qrDataUrl);
    setPhase('setup_qr');
  };

  const verifyCode = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/2fa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, code }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({})) as { error?: string; recoveryCodes?: string[] };
    if (!res.ok) { setError(data.error ?? 'Verification failed'); return; }
    setRecoveryCodes(data.recoveryCodes ?? []);
    setIsEnabled(true);
    setPhase('recovery_codes');
  };

  const disable = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? 'Failed to disable 2FA');
      return;
    }
    setIsEnabled(false);
    setCode('');
    setPhase('idle');
  };

  const downloadCodes = () => {
    const blob = new Blob([
      'Liravo 2FA Recovery Codes\nStore these safely — each code can only be used once.\n\n' +
        recoveryCodes.join('\n'),
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'liravo-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (phase === 'recovery_codes') {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
          <h2 className="font-semibold text-green-700 dark:text-green-400 mb-1">2FA enabled successfully</h2>
          <p className="text-sm text-muted-foreground">Save these recovery codes. Each one can only be used once to bypass 2FA.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-xl font-mono text-sm">
          {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
        </div>
        <button
          onClick={downloadCodes}
          className="w-full py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          Download recovery codes
        </button>
        <button
          onClick={() => { setPhase('idle'); setCode(''); setSecret(''); setQrDataUrl(''); }}
          className="w-full py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  if (phase === 'setup_qr') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="font-semibold mb-1">Scan with your authenticator app</h2>
          <p className="text-sm text-muted-foreground">Use Google Authenticator, Authy, or any TOTP app.</p>
        </div>
        {qrDataUrl && (
          <div className="flex justify-center">
            <Image src={qrDataUrl} alt="2FA QR code" width={200} height={200} className="rounded-lg" />
          </div>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Can&apos;t scan? Enter key manually</summary>
          <code className="block mt-2 p-2 bg-muted rounded font-mono break-all">{secret}</code>
        </details>
        <div>
          <label className="block text-sm font-medium mb-1.5">Enter the 6-digit code to confirm</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm tracking-widest text-center text-xl focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={() => { setPhase('idle'); setCode(''); }}
            className="flex-1 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={verifyCode}
            disabled={loading || code.length !== 6}
            className="flex-1 py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
          >
            {loading ? 'Verifying…' : 'Enable 2FA'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'disable') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app to confirm.</p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background text-sm tracking-widest text-center text-xl focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={() => { setPhase('idle'); setCode(''); setError(null); }}
            className="flex-1 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={disable}
            disabled={loading || code.length !== 6}
            className="flex-1 py-2.5 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-60"
          >
            {loading ? 'Disabling…' : 'Disable 2FA'}
          </button>
        </div>
      </div>
    );
  }

  // Idle state
  return (
    <div className="space-y-4">
      <div className={`p-3 rounded-xl text-sm font-medium ${
        isEnabled
          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
      }`}>
        {isEnabled ? '2FA is active on your account.' : '2FA is not enabled. We strongly recommend enabling it.'}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isEnabled ? (
        <button
          onClick={() => { setPhase('disable'); setError(null); }}
          disabled={loading}
          className="w-full py-2.5 bg-destructive/10 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/20 transition-colors"
        >
          Disable 2FA
        </button>
      ) : (
        <button
          onClick={startSetup}
          disabled={loading}
          className="w-full py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Set up 2FA'}
        </button>
      )}
    </div>
  );
}

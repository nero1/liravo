'use client';

import { useState, useRef } from 'react';

interface TipButtonProps {
  recipientId: string;
  recipientName: string;
}

const PRESET_AMOUNTS = [1, 3, 5];

export function TipButton({ recipientId, recipientName }: TipButtonProps) {
  const intent = useRef(crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function getSelectedAmount(): number {
    if (custom) return parseFloat(custom);
    return amount ?? 0;
  }

  async function handleTip() {
    const tipAmount = getSelectedAmount();
    if (!tipAmount || tipAmount < 0.5) {
      setErrorMsg('Minimum tip amount is $0.50');
      setStatus('error');
      return;
    }

    setPending(true);
    setStatus('idle');
    setErrorMsg('');

    const res = await fetch('/api/tips/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': intent.current },
      body: JSON.stringify({
        recipientId,
        amount: tipAmount,
        currency: 'USD',
      }),
    });

    if (res.ok) {
      intent.current = crypto.randomUUID();
      setStatus('success');
      setTimeout(() => {
        setOpen(false);
        setStatus('idle');
        setAmount(null);
        setCustom('');
      }, 2000);
    } else {
      const data = await res.json();
      setErrorMsg(data.error ?? 'Something went wrong');
      setStatus('error');
    }
    setPending(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold hover:bg-accent hover:text-white transition-colors"
      >
        Tip
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                Tip {recipientName}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {status === 'success' ? (
              <p className="text-green-600 dark:text-green-400 text-center font-medium py-4">
                Tip sent! Thank you for supporting {recipientName}.
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  {PRESET_AMOUNTS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        setAmount(preset);
                        setCustom('');
                      }}
                      className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                        amount === preset && !custom
                          ? 'bg-accent text-white border-accent'
                          : 'border-neutral-300 dark:border-neutral-700 hover:border-accent hover:text-accent'
                      }`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Custom amount (USD)</label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.01}
                    placeholder="Enter amount"
                    value={custom}
                    onChange={(e) => {
                      setCustom(e.target.value);
                      setAmount(null);
                    }}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                {status === 'error' && (
                  <p className="text-red-500 text-sm">{errorMsg}</p>
                )}

                <button
                  onClick={handleTip}
                  disabled={pending || (!amount && !custom)}
                  className="w-full py-2.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {pending ? 'Processing...' : `Send Tip${getSelectedAmount() ? ` — $${getSelectedAmount().toFixed(2)}` : ''}`}
                </button>

                <p className="text-xs text-neutral-500 text-center">
                  A 10% platform fee applies. Minimum $0.50.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

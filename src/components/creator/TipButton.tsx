'use client';

import { useState, useRef, useId, useEffect } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useRequestIntent } from '@/lib/client/useRequestIntent';

interface TipButtonProps {
  recipientId: string;
  recipientName: string;
}

const PRESET_AMOUNTS = [1, 3, 5];

export function TipButton({ recipientId, recipientName }: TipButtonProps) {
  const t = useTranslations('tips');
  const formatter = useFormatter();
  const intent = useRequestIntent();
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const fieldId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const selected = custom ? Number(custom) : amount ?? 0;
  const valid = Number.isFinite(selected) && selected >= 0.5 && selected <= 5000 && Math.abs(selected * 100 - Math.round(selected * 100)) < 0.000001;
  const price = (value: number) => formatter.number(value, { style: 'currency', currency: 'USD' });

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  async function handleTip() {
    if (!valid || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(false);
    const payload = { recipientId, amount: selected, currency: 'USD' };
    try {
      const response = await fetch('/api/tips/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...intent.headers(payload) }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || typeof data.redirectUrl !== 'string') throw new Error('Checkout unavailable');
      window.location.assign(data.redirectUrl);
    } catch { setError(true); }
    finally { busy.current = false; setPending(false); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold hover:bg-accent hover:text-white transition-colors">{t('tip')}</button>
      <dialog ref={dialog} aria-labelledby={titleId} onClose={() => setOpen(false)} className="bg-white dark:bg-neutral-900 dark:text-white rounded-2xl shadow-xl w-full max-w-sm p-6 backdrop:bg-black/50">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="font-display text-lg font-bold">{t('title', { name: recipientName })}</h2>
            <button onClick={() => setOpen(false)} aria-label={t('close')} className="text-neutral-400 text-xl leading-none">×</button>
          </div>
          <div className="flex gap-2">
            {PRESET_AMOUNTS.map(preset => (
              <button key={preset} disabled={pending} aria-pressed={amount === preset && !custom} onClick={() => { setAmount(preset); setCustom(''); }} className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${amount === preset && !custom ? 'bg-accent text-white border-accent' : 'border-neutral-300 dark:border-neutral-700'}`}>{price(preset)}</button>
            ))}
          </div>
          <div>
            <label htmlFor={fieldId} className="block text-xs text-neutral-500 mb-1">{t('custom')}</label>
            <input id={fieldId} type="number" min={0.5} max={5000} step={0.01} disabled={pending} placeholder={t('placeholder')} value={custom} onChange={event => { setCustom(event.target.value); setAmount(null); }} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          {error && <p role="alert" className="text-red-500 text-sm">{t('error')}</p>}
          <button onClick={handleTip} disabled={pending || !valid} className="w-full py-2.5 rounded-lg bg-accent text-white font-semibold disabled:opacity-50">{pending ? t('processing') : valid ? t('checkoutAmount', { amount: price(selected) }) : t('checkout')}</button>
          <p className="text-xs text-neutral-500 text-center">{t('fee', { minimum: price(0.5) })}</p>
        </div>
      </dialog>
    </>
  );
}

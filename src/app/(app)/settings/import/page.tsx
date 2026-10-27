'use client';

import { useState } from 'react';
import { useTranslations,useFormatter } from 'next-intl';
import { Upload, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function GoodreadsImportPage() {
  const t=useTranslations('goodreadsImport'),format=useFormatter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    if(file.size>2_000_000){setError(t('size'));return;}
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/import/goodreads', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json() as { imported: number; skipped: number };
        setResult(data);
      } else {
        setError(t('failed'));
      }
    } catch {
      setError(t('network'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-display font-bold mb-2">{t('title')}</h1>
      <p className="text-muted-foreground mb-6">
        {t('description')}
      </p>

      <div className="bg-muted/40 border border-border rounded-xl p-4 mb-6 text-sm">
        <p className="font-medium mb-1">{t('instructions')}</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
          <li>{t('step4')}</li>
        </ol>
      </div>

      <form aria-busy={loading} onSubmit={handleSubmit} className="space-y-4">
        <div
          className={cn(
            'border-2 border-dashed border-border rounded-xl p-8 text-center transition-colors',
            file ? 'border-amber-400 bg-amber-50/30 dark:bg-amber-950/10' : 'hover:border-amber-300'
          )}
        >
          <Upload className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
          {file ? (
            <div>
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {format.number(file.size/1000,{style:'unit',unit:'kilobyte',maximumFractionDigits:1})}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => {setFile(null);setResult(null);}}
                className="text-xs text-red-500 hover:text-red-600 mt-2"
              >
                {t('remove')}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                {t('drop')}
              </p>
              <label className="cursor-pointer px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors">
                {t('choose')}
                <input
                  type="file"
                  disabled={loading}
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {setFile(e.target.files?.[0] ?? null);setResult(null);setError(null);}}
                />
              </label>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div role="status" className="flex items-start gap-2 text-green-700 dark:text-green-400 text-sm bg-green-50 dark:bg-green-950/20 px-3 py-3 rounded-lg">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{t('complete')}</p>
              <p className="text-sm mt-0.5">
                {t('result',result)}
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || loading}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {loading ? t('importing') : t('submit')}
        </button>
      </form>
    </div>
  );
}

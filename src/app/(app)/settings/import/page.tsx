'use client';

import { useState } from 'react';
import { Upload, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function GoodreadsImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

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
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Import failed.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-display font-bold mb-2">Import from Goodreads</h1>
      <p className="text-muted-foreground mb-6">
        Export your Goodreads library as a CSV file and upload it here to import your books into Liravo.
      </p>

      <div className="bg-muted/40 border border-border rounded-xl p-4 mb-6 text-sm">
        <p className="font-medium mb-1">How to export from Goodreads:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Go to goodreads.com and sign in</li>
          <li>Navigate to My Books → Import and Export</li>
          <li>Click "Export Library" to download your CSV</li>
          <li>Upload the CSV file below</li>
        </ol>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-red-500 hover:text-red-600 mt-2"
              >
                Remove file
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Drop your Goodreads CSV here, or
              </p>
              <label className="cursor-pointer px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors">
                Browse files
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 text-green-700 dark:text-green-400 text-sm bg-green-50 dark:bg-green-950/20 px-3 py-3 rounded-lg">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Import complete!</p>
              <p className="text-sm mt-0.5">
                {result.imported} book{result.imported !== 1 ? 's' : ''} imported
                {result.skipped > 0 && `, ${result.skipped} skipped`}
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || loading}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Importing...' : 'Import library'}
        </button>
      </form>
    </div>
  );
}

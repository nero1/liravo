'use client';

import { useEffect, useState } from 'react';

interface ThemeRecord {
  name: string;
  css_overrides: string;
  is_active: boolean;
}

export default function ThemeAdminPage() {
  const [themes, setThemes] = useState<ThemeRecord[]>([]);
  const [newName, setNewName] = useState('');
  const [newCss, setNewCss] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/admin/themes')
      .then((r) => r.json())
      .then((d: { themes?: ThemeRecord[] }) => setThemes(d.themes ?? []))
      .catch(() => {});
  }, []);

  const activate = async (name: string) => {
    setSaving(true);
    setMessage(null);
    const res = await fetch('/api/admin/themes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, is_active: true }),
    });
    setSaving(false);
    if (res.ok) {
      setThemes((prev) => prev.map((t) => ({ ...t, is_active: t.name === name })));
      setMessage({ text: `Theme "${name}" activated.`, ok: true });
    } else {
      setMessage({ text: 'Failed to activate theme.', ok: false });
    }
  };

  const create = async () => {
    if (!newName.trim()) {
      setMessage({ text: 'Theme name is required.', ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch('/api/admin/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), css_overrides: newCss }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json() as { theme?: ThemeRecord };
      if (data.theme) setThemes((prev) => [...prev, data.theme!]);
      setNewName('');
      setNewCss('');
      setMessage({ text: 'Theme created.', ok: true });
    } else {
      setMessage({ text: 'Failed to create theme.', ok: false });
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">Theme Configuration</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Upload and activate custom themes. Themes are CSS variable overrides stored in the database.
        The active theme overrides the default light/dark values sitewide.
      </p>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.ok ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3 mb-8">
        <h2 className="font-medium">Existing Themes</h2>
        {themes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom themes yet.</p>
        ) : themes.map((theme) => (
          <div key={theme.name} className="flex items-center justify-between p-3 border border-border rounded-xl">
            <div>
              <span className="font-medium text-sm">{theme.name}</span>
              {theme.is_active && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 font-medium">
                  Active
                </span>
              )}
            </div>
            {!theme.is_active && (
              <button
                onClick={() => activate(theme.name)}
                disabled={saving}
                className="text-xs px-3 py-1.5 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-60"
              >
                Activate
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="border border-border rounded-xl p-4 space-y-4">
        <h2 className="font-medium">Add New Theme</h2>
        <div>
          <label className="block text-xs font-medium mb-1.5">Theme name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Midnight Forest"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5">CSS variable overrides</label>
          <textarea
            value={newCss}
            onChange={(e) => setNewCss(e.target.value)}
            rows={8}
            placeholder={`:root {\n  --background: #0a0a0a;\n  --foreground: #fafafa;\n  --accent: #16a34a;\n}`}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50 resize-y"
          />
        </div>
        <button
          onClick={create}
          disabled={saving}
          className="w-full py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Create theme'}
        </button>
      </div>
    </div>
  );
}

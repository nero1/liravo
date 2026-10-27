'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface ThemeRecord {
  name: string;
  css_overrides: string;
  is_active: boolean;
}

export default function ThemeAdminPage() {
  const t = useTranslations('admin');
  const [themes, setThemes] = useState<ThemeRecord[]>([]);
  const [newName, setNewName] = useState('');
  const [newCss, setNewCss] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/admin/themes')
      .then((r) => { if (!r.ok) throw new Error('Themes unavailable'); return r.json(); })
      .then((d: { themes?: ThemeRecord[] }) => setThemes(d.themes ?? []))
      .catch(() => setMessage({ text: t('loadThemesFailed'), ok: false }));
  }, [t]);

  const activate = async (name: string,is_active:boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/themes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, is_active }),
      });
      if (res.ok) {
        const current=await fetch('/api/admin/themes');if(!current.ok)throw new Error('Themes unavailable');
        const state=await current.json() as {themes:ThemeRecord[]};setThemes(state.themes);
        window.dispatchEvent(new Event('liravo:theme-changed'));
        setMessage({ text: t(is_active?'themeActivated':'themeDeactivated', { name }), ok: true });
      } else {
        setMessage({ text: t('activateThemeFailed'), ok: false });
      }
    } catch { setMessage({ text: t('updateFailed'), ok: false }); }
    finally { setSaving(false); }
  };

  const create = async () => {
    if (!newName.trim()) {
      setMessage({ text: t('themeNameRequired'), ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), css_overrides: newCss }),
      });
      if (res.ok) {
        const data = await res.json() as { theme?: ThemeRecord };
        if (data.theme) setThemes((prev) => [...prev.filter(theme=>theme.name!==data.theme!.name), data.theme!]);
        setNewName('');
        setNewCss('');
        setMessage({ text: t('themeCreated'), ok: true });
      } else {
        setMessage({ text: t('createThemeFailed'), ok: false });
      }
    } catch { setMessage({ text: t('updateFailed'), ok: false }); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">{t('themeConfiguration')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t('themeDescription')}</p>

      {message && (
        <div role={message.ok ? 'status' : 'alert'} className={`mb-4 p-3 rounded-lg text-sm ${message.ok ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3 mb-8">
        <h2 className="font-medium">{t('existingThemes')}</h2>
        {themes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noCustomThemesYet')}</p>
        ) : themes.map((theme) => (
          <div key={theme.name} className="flex items-center justify-between p-3 border border-border rounded-xl">
            <div>
              <span className="font-medium text-sm">{theme.name}</span>
              {theme.is_active && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 font-medium">{t('active')}</span>
              )}
            </div>
            {(
              <button
                onClick={() => activate(theme.name,!theme.is_active)}
                disabled={saving}
                className="text-xs px-3 py-1.5 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-60"
              >{t(theme.is_active?'deactivate':'activate')}</button>
            )}
          </div>
        ))}
      </div>

      <div aria-busy={saving} className="border border-border rounded-xl p-4 space-y-4">
        <h2 className="font-medium">{t('addNewTheme')}</h2>
        <div>
          <label htmlFor="theme-name" className="block text-xs font-medium mb-1.5">{t('themeName')}</label>
          <input id="theme-name" maxLength={80} disabled={saving}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('eGMidnightForest')}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label htmlFor="theme-css" className="block text-xs font-medium mb-1.5">{t('cssVariableOverrides')}</label>
          <textarea id="theme-css" maxLength={50000} disabled={saving}
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
          {saving ? t('saving') : t('createTheme')}
        </button>
      </div>
    </div>
  );
}

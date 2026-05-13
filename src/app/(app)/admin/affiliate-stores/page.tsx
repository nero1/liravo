'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface AffiliateStore {
  id: string;
  name: string;
  countries: string[];
  url_template: string;
  affiliate_tag: string | null;
  is_active: boolean;
  priority: number;
  is_non_affiliate: boolean;
}

interface FormState {
  name: string;
  countries: string;
  url_template: string;
  affiliate_tag: string;
  is_active: boolean;
  priority: string;
  is_non_affiliate: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  countries: '',
  url_template: '',
  affiliate_tag: '',
  is_active: true,
  priority: '10',
  is_non_affiliate: false,
};

export default function AdminAffiliateStoresPage() {
  const [stores, setStores] = useState<AffiliateStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStores = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/affiliate-stores');
      if (!res.ok) throw new Error('Failed to load stores');
      const data = await res.json() as { stores: AffiliateStore[] };
      setStores(data.stores ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStores(); }, []);

  const startEdit = (store: AffiliateStore) => {
    setEditingId(store.id);
    setForm({
      name: store.name,
      countries: store.countries.join(', '),
      url_template: store.url_template,
      affiliate_tag: store.affiliate_tag ?? '',
      is_active: store.is_active,
      priority: store.priority.toString(),
      is_non_affiliate: store.is_non_affiliate,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        countries: form.countries.split(',').map((c) => c.trim()).filter(Boolean),
        url_template: form.url_template,
        affiliate_tag: form.affiliate_tag || null,
        is_active: form.is_active,
        priority: parseInt(form.priority, 10),
        is_non_affiliate: form.is_non_affiliate,
      };

      const isNew = editingId === 'new';
      const res = await fetch('/api/admin/affiliate-stores', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? payload : { id: editingId, ...payload }),
      });

      if (!res.ok) throw new Error('Failed to save store');
      setEditingId(null);
      setForm(EMPTY_FORM);
      await fetchStores();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const isEditing = (id: string) => editingId === id;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Affiliate Store Registry</h1>
        <button
          onClick={() => { setEditingId('new'); setForm(EMPTY_FORM); }}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          Add Store
        </button>
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {editingId === 'new' && (
        <StoreForm
          form={form}
          setForm={setForm}
          onSave={handleSave}
          onCancel={() => setEditingId(null)}
          saving={saving}
        />
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-3">
          {stores.map((store) => (
            <div key={store.id} className="rounded-xl border border-border bg-card p-4">
              {isEditing(store.id) ? (
                <StoreForm
                  form={form}
                  setForm={setForm}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{store.name}</span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded', store.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground')}>
                        {store.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {store.is_non_affiliate && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Non-affiliate</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Countries: {store.countries.join(', ')} | Priority: {store.priority}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{store.url_template}</p>
                    {store.affiliate_tag && (
                      <p className="text-xs text-muted-foreground">Tag: {store.affiliate_tag}</p>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(store)}
                    className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors shrink-0"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-xl border border-accent bg-accent/5 p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Countries (comma-separated)</label>
          <input
            value={form.countries}
            onChange={(e) => setForm({ ...form, countries: e.target.value })}
            placeholder="US, UK, CA"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">URL Template</label>
          <input
            value={form.url_template}
            onChange={(e) => setForm({ ...form, url_template: e.target.value })}
            placeholder="https://example.com/search?q={isbn}&tag={tag}"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Affiliate Tag</label>
          <input
            value={form.affiliate_tag}
            onChange={(e) => setForm({ ...form, affiliate_tag: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Priority</label>
          <input
            type="number"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="rounded"
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_non_affiliate}
            onChange={(e) => setForm({ ...form, is_non_affiliate: e.target.checked })}
            className="rounded"
          />
          Non-affiliate
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  user_types: string[];
  is_premium: boolean;
  is_moderator: boolean;
  is_admin: boolean;
  is_suspended: boolean;
  created_at: string;
}

interface PageData {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export default function AdminUsersPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error('Failed to load users');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAction = async (userId: string, field: string, value: boolean) => {
    setActionLoading(`${userId}-${field}`);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, [field]: value }),
      });
      await fetchUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">User Management</h1>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by username..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Username</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Types</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Premium</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Mod</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Admin</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Joined</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <span className="font-medium">@{u.username}</span>
                    {u.is_suspended && (
                      <span className="ml-2 text-xs text-destructive">[suspended]</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.user_types.join(', ')}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('text-xs font-semibold', u.is_premium ? 'text-accent' : 'text-muted-foreground')}>
                      {u.is_premium ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('text-xs font-semibold', u.is_moderator ? 'text-accent' : 'text-muted-foreground')}>
                      {u.is_moderator ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('text-xs font-semibold', u.is_admin ? 'text-accent' : 'text-muted-foreground')}>
                      {u.is_admin ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleAction(u.id, 'is_moderator', !u.is_moderator)}
                        disabled={actionLoading === `${u.id}-is_moderator`}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        {u.is_moderator ? 'Revoke Mod' : 'Grant Mod'}
                      </button>
                      <button
                        onClick={() => handleAction(u.id, 'is_premium', !u.is_premium)}
                        disabled={actionLoading === `${u.id}-is_premium`}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        {u.is_premium ? 'Revoke Premium' : 'Grant Premium'}
                      </button>
                      <button
                        onClick={() => handleAction(u.id, 'is_suspended', !u.is_suspended)}
                        disabled={actionLoading === `${u.id}-is_suspended`}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-muted transition-colors disabled:opacity-50 text-destructive"
                      >
                        {u.is_suspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

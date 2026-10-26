'use client';

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface FollowButtonProps {
  targetUserId: string;
  currentUserId: string;
  initialFollowing: boolean;
}

export function FollowButton({ targetUserId, currentUserId, initialFollowing }: FollowButtonProps) {
  const intent = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  if (targetUserId === currentUserId) return null;

  async function handleClick() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${targetUserId}/follow`, {
        method: following ? 'DELETE' : 'POST',
        headers: { 'X-Idempotency-Key': intent.current },
      });
      if (res.ok) {
        const data = await res.json() as { following: boolean };
        if (typeof data.following !== 'boolean') throw new Error('Invalid follow response');
        intent.current = crypto.randomUUID();
        setFollowing(data.following);
      }
    } catch {
      // Ignore errors
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
        following
          ? 'bg-muted text-foreground border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-950/20'
          : 'bg-amber-500 text-white hover:bg-amber-600'
      )}
    >
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}

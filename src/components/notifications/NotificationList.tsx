'use client';

import { useState, useEffect } from 'react';
import { Bell, UserPlus, Heart, MessageSquare, Award, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotificationRow } from '@/types/database';

function NotificationIcon({ type }: { type: string }) {
  const iconClass = 'w-5 h-5';
  switch (type) {
    case 'follow':
      return <UserPlus className={cn(iconClass, 'text-amber-500')} />;
    case 'like':
    case 'review_like':
      return <Heart className={cn(iconClass, 'text-red-500')} />;
    case 'reply':
    case 'review_comment':
      return <MessageSquare className={cn(iconClass, 'text-blue-500')} />;
    case 'challenge_complete':
    case 'badge_earned':
      return <Award className={cn(iconClass, 'text-purple-500')} />;
    case 'milestone':
      return <Target className={cn(iconClass, 'text-green-500')} />;
    default:
      return <Bell className={cn(iconClass, 'text-muted-foreground')} />;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationList() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json() as { notifications: NotificationRow[] };
          setNotifications(data.notifications);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function markAllRead() {
    setMarking(true);
    try {
      const res = await fetch('/api/notifications', { method: 'PATCH' });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      }
    } finally {
      setMarking(false);
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </span>
          <button
            onClick={markAllRead}
            disabled={marking}
            className="text-sm text-amber-600 hover:text-amber-700 font-medium disabled:opacity-50"
          >
            {marking ? 'Marking...' : 'Mark all read'}
          </button>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <Bell className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">No notifications yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            When people follow you or interact with your reviews, you'll see it here.
          </p>
        </div>
      ) : (
        <ul>
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3 transition-colors border-b border-border/50 last:border-0',
                !notification.is_read && 'bg-amber-50/50 dark:bg-amber-950/10'
              )}
            >
              <div className="mt-0.5 shrink-0">
                <NotificationIcon type={notification.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm',
                  !notification.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}>
                  {notification.message}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {timeAgo(notification.created_at)}
                </p>
              </div>
              {!notification.is_read && (
                <div className="w-2 h-2 bg-amber-500 rounded-full mt-1.5 shrink-0" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

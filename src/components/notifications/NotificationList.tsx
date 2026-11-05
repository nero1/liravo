'use client';

import Link from 'next/link';
import {notificationText,writerQuestionLink} from '@/lib/notification-message';

import { useState,useEffect,useRef } from 'react';
import { Bell, UserPlus, Heart, MessageSquare, Award, Target } from 'lucide-react';
import {useTranslations,useFormatter,useNow,useLocale} from 'next-intl';
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

export function NotificationList(){
  const messages=useTranslations(''),locale=useLocale(),actor=useRef<string|null>(null),t=useTranslations('notificationList'),common=useTranslations('common'),formatter=useFormatter(),now=useNow({updateInterval:60000}),busy=useRef(false),[nextCursor,setNextCursor]=useState<string|null>(null),[loadingMore,setLoadingMore]=useState(false),[loadError,setLoadError]=useState(false),[markError,setMarkError]=useState(false),[revision,setRevision]=useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    const controller=new AbortController();setLoading(true);setLoadError(false);
    void fetch('/api/notifications',{signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok||typeof data.actorId!=='string'||!Array.isArray(data.notifications))throw new Error('Notifications unavailable');
      if(!controller.signal.aborted){actor.current=data.actorId;setNotifications(data.notifications);setNextCursor(data.nextCursor??null);}
    }).catch(()=>{if(!controller.signal.aborted)setLoadError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[revision]);

  async function loadMore(){
    if(!nextCursor||busy.current)return;busy.current=true;setLoadingMore(true);setLoadError(false);
    try{
      const res=await fetch('/api/notifications?cursor='+encodeURIComponent(nextCursor)),data=await res.json();
      if(!res.ok||!Array.isArray(data.notifications))throw new Error('Notifications unavailable');
      if(data.actorId!==actor.current){actor.current=null;setNotifications([]);setNextCursor(null);setRevision(value=>value+1);return;}
      setNotifications(previous=>[...new Map([...previous,...data.notifications].map(item=>[item.id,item])).values()]);setNextCursor(data.nextCursor??null);
    }catch{setLoadError(true);}
    finally{busy.current=false;setLoadingMore(false);}
  }

  async function markAllRead(){
    if(busy.current)return;busy.current=true;setMarking(true);setMarkError(false);
    try{
      const res=await fetch('/api/notifications',{method:'PATCH',headers:{'X-Liravo-Actor':actor.current??''}}),data=await res.json();
      if(res.status===409){actor.current=null;setNotifications([]);setNextCursor(null);setRevision(value=>value+1);return;}
      if(!res.ok||data.ok!==true)throw new Error('Mark read unavailable');
      setNotifications(previous=>previous.map(item=>({...item,is_read:true})));
    }catch{setMarkError(true);}
    finally{busy.current=false;setMarking(false);}
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <div role="status" aria-label={common('loading')} className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {loadError&&<p role="alert" className="text-sm text-destructive px-4">{t('loadFailed')} <button disabled={loadingMore||marking} onClick={()=>notifications.length?void loadMore():setRevision(value=>value+1)}>{common('retry')}</button></p>}
      {markError&&<p role="alert" className="text-sm text-destructive px-4">{t('markFailed')} <button disabled={loadingMore||marking} onClick={markAllRead}>{common('retry')}</button></p>}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">
            {t('unread',{count:unreadCount})}
          </span>
          <button
            onClick={markAllRead}
            disabled={marking||loadingMore}
            className="text-sm text-amber-600 hover:text-amber-700 font-medium disabled:opacity-50"
          >
            {marking?t('marking'):t('markAll')}
          </button>
        </div>
      )}

      {notifications.length===0&&!loadError?(
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <Bell className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">{t('empty')}</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            {t('emptyDetail')}
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
              <div aria-hidden="true" className="mt-0.5 shrink-0">
                <NotificationIcon type={notification.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm',
                  !notification.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}>
                  {writerQuestionLink(notification)?<Link href={writerQuestionLink(notification)!} className="hover:underline">{notificationText(notification,messages,key=>messages.has(key),locale)}</Link>:notificationText(notification,messages,key=>messages.has(key),locale)}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {formatter.relativeTime(new Date(notification.created_at),now)}
                </p>
              </div>
              {!notification.is_read && (
                <div className="w-2 h-2 bg-amber-500 rounded-full mt-1.5 shrink-0" />
              )}
            </li>
          ))}
        </ul>
      )}
      {nextCursor&&<button onClick={loadMore} disabled={loadingMore||marking} className="px-4 py-3 text-sm text-accent disabled:opacity-50">{loadingMore?common('loading'):t('more')}</button>}
    </div>
  );
}

import {createTranslator} from 'next-intl';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';
import {notificationText} from '@/lib/notification-message';
import {NOTIFICATION_KEYS,notificationPreference} from '@/lib/notification-preferences';
import { createServiceClient } from '@/lib/supabase/server';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  notificationType?:string;
  entityType?:string;
  messageKey?:string|null;
  messageValues?:Record<string,unknown>|null;
}

interface WebPushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendWebPush(sub: WebPushSub, payload: PushPayload): Promise<boolean> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:hello@liravo.org';

  if (!vapidPublicKey || !vapidPrivateKey) return false;

  try {
    const webpush = await import('web-push');
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch {
    return false;
  }
}

async function sendExpoPush(pushToken: string, payload: PushPayload): Promise<boolean> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: payload.title,
        body: payload.body,
        data: { url: payload.url ?? '/' },
      }),
    });
    if(!res.ok)return false;
    const result=await res.json();return result?.data?.status==='ok';
  } catch {
    return false;
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const supabase = createServiceClient();

  const [webSubsResult, userResult] = await Promise.all([
    supabase.from('web_push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId),
    supabase.from('users').select('push_token,preferred_locale,is_banned,deleted_at,'+NOTIFICATION_KEYS.join(',')).eq('id', userId).single(),
  ]);

  const user=userResult.data as Record<string,unknown>|null;
  if(userResult.error||!user||user.is_banned||user.deleted_at)return;
  const preference=payload.notificationType?notificationPreference(payload.notificationType,payload.entityType):null;
  if(preference&&user[preference]===false)return;
  const locale=user.preferred_locale==='fr'||user.preferred_locale==='de'?user.preferred_locale:'en';
  const t=createTranslator({locale,messages:({en,fr,de})[locale]});
  const category=payload.notificationType==='follow'?'follow':payload.notificationType==='tip'?'tip':payload.notificationType==='badge_earned'?'badge':'activity';
  const localized={title:payload.notificationType?t(`notificationMessages.titles.${category}`):payload.title,
    body:payload.messageKey?notificationText({type:payload.notificationType??'',message:payload.body,message_key:payload.messageKey,message_values:payload.messageValues},t,key=>t.has(key),locale):payload.body,
    url:payload.url,tag:payload.tag};
  const promises: Promise<boolean>[] = [];

  // Web push
  for (const sub of (webSubsResult.data ?? []) as WebPushSub[]) {
    promises.push(sendWebPush(sub, localized));
  }

  // Expo push
  const pushToken = (userResult.data as { push_token?: string } | null)?.push_token;
  if (pushToken) {
    promises.push(sendExpoPush(pushToken, localized));
  }

  const outcomes=await Promise.allSettled(promises);
  if(outcomes.length&&!outcomes.some(result=>result.status==='fulfilled'&&result.value))throw new Error('Push delivery unavailable');
}

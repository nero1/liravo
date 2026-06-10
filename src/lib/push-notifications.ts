import { createServiceClient } from '@/lib/supabase/server';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
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
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const supabase = createServiceClient();

  const [webSubsResult, userResult] = await Promise.all([
    supabase.from('web_push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId),
    supabase.from('users').select('push_token').eq('id', userId).single(),
  ]);

  const promises: Promise<boolean>[] = [];

  // Web push
  for (const sub of (webSubsResult.data ?? []) as WebPushSub[]) {
    promises.push(sendWebPush(sub, payload));
  }

  // Expo push
  const pushToken = (userResult.data as { push_token?: string } | null)?.push_token;
  if (pushToken) {
    promises.push(sendExpoPush(pushToken, payload));
  }

  await Promise.allSettled(promises);
}

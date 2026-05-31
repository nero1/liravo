/**
 * Google Play Real-time Developer Notifications (RTDN)
 *
 * Google sends subscription lifecycle events (renewed, cancelled, expired, etc.)
 * as Pub/Sub push messages to this endpoint.
 *
 * Setup (one-time, in Google Cloud Console):
 *   1. Create a Pub/Sub topic: "play-rtdn"
 *   2. Create a push subscription pointing to: https://liravo.org/api/mobile/rtdn?secret=<RTDN_SECRET>
 *   3. In Play Console → Monetize → Subscriptions → Real-time notifications,
 *      enter the full Pub/Sub topic resource name.
 *   4. Set GOOGLE_PLAY_RTDN_SECRET env var to the same secret value.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSubscriptionPurchase, isSubscriptionActive } from '@/lib/google-play';
import { recordMetric } from '@/lib/metrics';
import { withRedisLock } from '@/lib/locks';

export const dynamic = 'force-dynamic';

// Notification types from Google Play Billing
const ACTIVE_TYPES = new Set([1, 2, 4, 6, 7]); // recovered, renewed, purchased, grace_period, restarted
const INACTIVE_TYPES = new Set([3, 12, 13]);     // cancelled, revoked, expired

interface PubSubMessage {
  message: { data: string; messageId: string };
  subscription: string;
}

interface DeveloperNotification {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: {
    version: string;
    notificationType: number;
    purchaseToken: string;
    subscriptionId: string;
  };
}

export async function POST(request: Request) {
  // Verify the shared secret to reject spoofed requests
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const expectedSecret = process.env.GOOGLE_PLAY_RTDN_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let pubsub: PubSubMessage;
  try {
    pubsub = await request.json() as PubSubMessage;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let notification: DeveloperNotification;
  try {
    notification = JSON.parse(
      Buffer.from(pubsub.message.data, 'base64').toString('utf-8'),
    ) as DeveloperNotification;
  } catch {
    return NextResponse.json({ error: 'Invalid notification payload' }, { status: 400 });
  }

  const sub = notification.subscriptionNotification;
  if (!sub) {
    // Could be a test notification or one-time product — acknowledge and ignore
    return NextResponse.json({ ok: true });
  }

  const { purchaseToken, notificationType } = sub;

  // Use a distributed lock so concurrent RTDN events for the same token don't race
  await withRedisLock(`rtdn:${purchaseToken.slice(0, 32)}`, 30, async () => {
    const supabase = createServiceClient();

    // Find the user who owns this purchase token
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id, user_id, status')
      .eq('provider_event_id', purchaseToken)
      .eq('provider', 'google_play')
      .maybeSingle();

    if (!subscription) {
      // Token not found locally — nothing to update
      return;
    }

    let active: boolean;

    if (ACTIVE_TYPES.has(notificationType)) {
      // Confirm with Play API for active types to get accurate expiry
      try {
        const state = await getSubscriptionPurchase(purchaseToken);
        active = isSubscriptionActive(state);
      } catch {
        active = true; // Be generous on API error for active-type notifications
      }
    } else if (INACTIVE_TYPES.has(notificationType)) {
      active = false;
    } else {
      // Other types (on_hold, paused, price_change, etc.) — re-verify with API
      try {
        const state = await getSubscriptionPurchase(purchaseToken);
        active = isSubscriptionActive(state);
      } catch {
        return; // Can't determine state, skip
      }
    }

    const newStatus = active ? 'active' : 'cancelled';
    if (subscription.status === newStatus) return; // Already up to date

    await supabase
      .from('subscriptions')
      .update({ status: newStatus })
      .eq('id', subscription.id);

    await supabase
      .from('users')
      .update({ is_premium: active })
      .eq('id', subscription.user_id);

    recordMetric('google_play_rtdn_processed', {
      notificationType: String(notificationType),
      active: String(active),
    });
  });

  // Always 200 to acknowledge receipt — Pub/Sub retries on non-2xx
  return NextResponse.json({ ok: true });
}

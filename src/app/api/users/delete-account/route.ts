import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

// Soft-delete: sets deleted_at, hard delete via cron after 30 days (PRD §15.10)
export async function DELETE(req: Request) {
  const ip = getClientIp(req);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  // Soft delete: mark user as deleted, anonymise display data
  const { error } = await service
    .from('users')
    .update({
      deleted_at: new Date().toISOString(),
      display_name: '[Deleted User]',
      username: `deleted_${user.id.slice(0, 8)}`,
      bio: null,
      avatar_url: null,
    })
    .eq('id', user.id);

  if (error) {
    recordMetric('account_delete_error', { error: error.message }, 'error');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sign the user out immediately
  await supabase.auth.signOut();

  recordMetric('account_deleted', { user_id: user.id });
  return NextResponse.json({ deleted: true, message: 'Your account has been scheduled for deletion. It will be permanently removed in 30 days.' });
}

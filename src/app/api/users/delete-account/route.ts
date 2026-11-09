import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isDirectPostgres } from '@/lib/db/provider';
import { SESSION_COOKIE, destroySession } from '@/lib/db/unified-client';

export const dynamic = 'force-dynamic';

// Deactivate the profile; related records are retained.
export async function DELETE(req: Request) {
  const ip = getClientIp(req);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  // Soft delete: mark user as deleted, anonymise display data
  const { error } = await service
    .from('users')
    .update({
      deleted_at: new Date().toISOString(),
      display_name: '[Deleted User]',
      username: `deleted_${user.id.replaceAll('-', '')}`,
      bio: null,
      avatar_url: null,
    })
    .eq('id', user.id);

  if (error) {
    recordMetric('account_delete_error', { error: error.message }, 'error');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sign the user out immediately
  if (isDirectPostgres()) {
    // Direct-postgres mode: destroy Redis session and clear the session cookie
    const cookieStore = await cookies();
    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]??cookieStore.get(SESSION_COOKIE)?.value;
    try{if(token)await destroySession(token);}catch{recordMetric('account_session_cleanup_error',{user_id:user.id},'error');}
    const response = NextResponse.json({ deleted: true, status: 'deactivated' });
    response.cookies.delete(SESSION_COOKIE);
    recordMetric('account_deleted', { user_id: user.id });
    return response;
  } else {
    const supabase = (await createClient());
    await supabase.auth.signOut();
  }

  recordMetric('account_deleted', { user_id: user.id });
  return NextResponse.json({ deleted: true, status: 'deactivated' });
}

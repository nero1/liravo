import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ count: pending }, { count: failed }] = await Promise.all([
    supabase.from('outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);

  return NextResponse.json({ pending: pending ?? 0, failed: failed ?? 0 });
}

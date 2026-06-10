import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  const day7Start = new Date(now.getTime() - 7.5 * 24 * 60 * 60 * 1000).toISOString();
  const day7End = new Date(now.getTime() - 6.5 * 24 * 60 * 60 * 1000).toISOString();
  const day30Start = new Date(now.getTime() - 30.5 * 24 * 60 * 60 * 1000).toISOString();
  const day30End = new Date(now.getTime() - 29.5 * 24 * 60 * 60 * 1000).toISOString();
  const cooloffWindow = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString();

  const { data: day7Users } = await supabase
    .from('users')
    .select('id')
    .is('email', null)
    .gte('created_at', day7Start)
    .lte('created_at', day7End);

  const { data: day30Users } = await supabase
    .from('users')
    .select('id')
    .is('email', null)
    .gte('created_at', day30Start)
    .lte('created_at', day30End);

  const allUsers = [...(day7Users ?? []), ...(day30Users ?? [])];
  let notified = 0;

  for (const user of allUsers) {
    const { data: recent } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'account_hardening')
      .gte('created_at', cooloffWindow)
      .maybeSingle();

    if (recent) continue;

    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'account_hardening',
      message: 'Secure your account — add an email address to prevent lockout.',
    });

    notified++;
  }

  return NextResponse.json({ notified });
}

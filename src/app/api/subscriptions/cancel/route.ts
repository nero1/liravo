import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'active');

  await supabase
    .from('users')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ is_premium: false } as any)
    .eq('id', user.id);

  return NextResponse.json({ cancelled: true });
}

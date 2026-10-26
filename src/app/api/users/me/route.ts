import { clientUser, OWN_USER_COLUMNS } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data: user, error } = await supabase
    .from('users')
    .select(OWN_USER_COLUMNS)
    .eq('id', session.id)
    .maybeSingle();

  if (error || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({ user: clientUser(user) });
}

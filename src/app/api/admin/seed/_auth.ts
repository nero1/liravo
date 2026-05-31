import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { NextResponse } from 'next/server';

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function requireAdminServiceClient(): Promise<
  | { service: ServiceClient; error: null }
  | { service: null; error: NextResponse }
> {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) {
    return { service: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) {
    return { service: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { service: createServiceClient(), error: null };
}

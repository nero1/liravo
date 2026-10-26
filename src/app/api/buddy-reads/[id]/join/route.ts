import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'Invalid buddy read' }, { status: 400 });
  const { error } = await createServiceClient().from('buddy_read_members').upsert({
    buddy_read_id: params.id, user_id: user.id,
  }, { onConflict: 'buddy_read_id,user_id', ignoreDuplicates: true });
  if (error) {
    const status = error.code === 'P1004' ? 409 : error.code === 'P1005' ? 403 : 503;
    return NextResponse.json({ error: status === 409 ? 'Buddy read is full' : status === 403 ? 'Buddy read unavailable' : 'Joining unavailable' }, { status });
  }
  return NextResponse.json({ joined: true });
}

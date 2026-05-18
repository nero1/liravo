import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// reading_list_follows table not in generated types — using any cast

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase 
    .from('reading_list_follows')
    .upsert({ list_id: params.id, user_id: user.id });

  if (error) {
    return NextResponse.json({ error: 'Failed to follow list' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await supabase 
    .from('reading_list_follows')
    .delete()
    .eq('list_id', params.id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}

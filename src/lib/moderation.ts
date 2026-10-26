import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export type ModeratorAction = 'approve' | 'remove' | 'warn' | 'escalate';

export async function isModerator(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: user } = await supabase
    .from('users')
    .select('is_moderator, is_admin')
    .eq('id', userId)
    .single();

  return !!(user?.is_moderator || user?.is_admin);
}

export async function requireModerator(): Promise<{ userId: string } | NextResponse> {
  const user=await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mod = await isModerator(user.id);
  if (!mod) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { userId: user.id };
}

export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: user } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();

  return !!user?.is_admin;
}

export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const user=await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await isAdmin(user.id);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { userId: user.id };
}

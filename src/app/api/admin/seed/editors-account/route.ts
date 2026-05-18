import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();

  // Check if already exists
  const { data: existing } = await service
    .from('users')
    .select('id')
    .eq('username', 'liravo_editors')
    .single();

  if (existing) {
    return NextResponse.json(
      { error: 'Liravo Editors account already exists' },
      { status: 409 }
    );
  }

  // Create via service client (bypasses RLS)
  // Generates a placeholder auth user ID — in production, this would use admin.createUser
  const placeholderId = `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

  const { error } = await service.from('users').insert({
    id: placeholderId,
    username: 'liravo_editors',
    display_name: 'Liravo Editors',
    referral_code: '000000000000',
    user_types: ['creator'],
    is_verified_author: true,
    onboarding_complete: true,
    profile_visibility: 'public',
    shelf_visibility: 'public',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { message: 'Liravo Editors account created successfully', id: placeholderId },
    { status: 201 }
  );
}

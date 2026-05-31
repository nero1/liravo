import { NextResponse } from 'next/server';
import { requireAdminServiceClient } from '../_auth';

export const dynamic = 'force-dynamic';

const EDITORS_EMAIL = 'liravo_editors_system@liravo.internal';
const EDITORS_REFERRAL = '000000000000';
const EDITORS_ID_FALLBACK = '00000000-0000-4000-a000-000000000001';

export async function POST() {
  const { service, error } = await requireAdminServiceClient();
  if (error) return error;

  const { data: existing } = await service
    .from('users')
    .select('id')
    .eq('username', 'liravo_editors')
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { message: 'Liravo Editors account already exists', id: existing.id },
      { status: 409 }
    );
  }

  // Attempt auth user creation (Supabase mode).
  // In DO mode auth.admin is unavailable — fall back to direct insert.
  let userId: string = EDITORS_ID_FALLBACK;

  if (service.auth?.admin) {
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: EDITORS_EMAIL,
      email_confirm: true,
      user_metadata: { username: 'liravo_editors', full_name: 'Liravo Editors' },
    });

    if (authError && !authError.message?.includes('already been registered')) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
    if (authData?.user?.id) {
      userId = authData.user.id;
    }
  }

  // Check if the handle_new_user trigger already created the row
  const { data: triggered } = await service
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  const profileFields = {
    username: 'liravo_editors',
    display_name: 'Liravo Editors',
    referral_code: EDITORS_REFERRAL,
    user_types: ['creator'],
    is_verified_author: true,
    onboarding_complete: true,
    profile_visibility: 'public',
    shelf_visibility: 'public',
    updated_at: new Date().toISOString(),
  };

  if (triggered) {
    const { error: updateErr } = await service.from('users').update(profileFields).eq('id', userId);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  } else {
    const { error: insertErr } = await service.from('users').insert({
      id: userId,
      ...profileFields,
      created_at: new Date().toISOString(),
    });
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { message: 'Liravo Editors account created successfully', id: userId },
    { status: 201 }
  );
}

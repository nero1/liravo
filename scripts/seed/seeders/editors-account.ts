import type { SeedClient } from '../client.js';
import type { SeedResult } from '../utils.js';
import { isDryRun } from '../utils.js';

export const EDITORS_ID_DO = '00000000-0000-4000-a000-000000000001';
const EDITORS_EMAIL = 'liravo_editors_system@liravo.internal';
const EDITORS_REFERRAL = '000000000000';

export async function seedEditorsAccount(client: SeedClient): Promise<SeedResult & { editorsId: string }> {
  const result: SeedResult & { editorsId: string } = { inserted: 0, skipped: 0, errors: [], editorsId: '' };

  if (isDryRun) {
    result.inserted = 1;
    result.editorsId = EDITORS_ID_DO;
    return result;
  }

  const { data: existing } = await client
    .from('users')
    .select('id')
    .eq('username', 'liravo_editors')
    .maybeSingle();

  if (existing) {
    result.skipped = 1;
    result.editorsId = existing.id;
    return result;
  }

  // Attempt to create the auth user (Supabase mode).
  // In DO mode auth.admin is not available — fall back to direct insert.
  let userId: string | null = null;

  if (client.auth?.admin) {
    const { data: authData, error: authError } = await client.auth.admin.createUser({
      email: EDITORS_EMAIL,
      email_confirm: true,
      user_metadata: { username: 'liravo_editors', full_name: 'Liravo Editors' },
    });

    if (authError && !authError.message?.includes('already been registered')) {
      result.errors.push(`auth.admin.createUser failed: ${authError.message}`);
    } else {
      userId = authData?.user?.id ?? null;
    }
  }

  // Fall back to stable deterministic ID for DO mode (no auth.users table)
  if (!userId) {
    userId = EDITORS_ID_DO;
  }

  // Check if trigger already created the users row
  const { data: triggered } = await client
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (triggered) {
    // Trigger ran — patch it with the correct profile fields
    const { error: updateErr } = await client
      .from('users')
      .update({
        username: 'liravo_editors',
        display_name: 'Liravo Editors',
        user_types: ['creator'],
        is_verified_author: true,
        onboarding_complete: true,
        profile_visibility: 'public',
        shelf_visibility: 'public',
        referral_code: EDITORS_REFERRAL,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (updateErr) result.errors.push(updateErr.message);
  } else {
    // Trigger didn't run (DO mode or hook disabled) — insert directly
    const { error: insertErr } = await client.from('users').insert({
      id: userId,
      username: 'liravo_editors',
      display_name: 'Liravo Editors',
      referral_code: EDITORS_REFERRAL,
      user_types: ['creator'],
      is_verified_author: true,
      onboarding_complete: true,
      profile_visibility: 'public',
      shelf_visibility: 'public',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (insertErr) {
      result.errors.push(insertErr.message);
    }
  }

  result.inserted = result.errors.length === 0 ? 1 : 0;
  result.editorsId = userId;
  return result;
}

export async function getEditorsId(client: SeedClient): Promise<string | null> {
  const { data } = await client
    .from('users')
    .select('id')
    .eq('username', 'liravo_editors')
    .maybeSingle();
  return data?.id ?? null;
}

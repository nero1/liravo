import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  return profile?.is_admin ? user : null;
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  css_overrides: z.string().max(50_000).default(''),
});

const patchSchema = z.object({
  name: z.string().min(1).max(80),
  is_active: z.boolean(),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('custom_themes')
    .select('name, css_overrides, is_active')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ themes: data ?? [] });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.text().catch(() => '');
  if (raw.length > 60_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('custom_themes')
    .insert({ name: parsed.data.name, css_overrides: parsed.data.css_overrides, is_active: false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ theme: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.text().catch(() => '');
  if (raw.length > 1000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceClient();

  // Deactivate all other themes first, then activate the chosen one
  await supabase.from('custom_themes').update({ is_active: false }).neq('name', parsed.data.name);
  const { error } = await supabase
    .from('custom_themes')
    .update({ is_active: parsed.data.is_active })
    .eq('name', parsed.data.name);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

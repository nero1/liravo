import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const BodySchema = z.object({
  locale: z.enum(['en', 'fr', 'de']),
});

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid locale. Use en, fr, or de.' }, { status: 400 });
  }

  const { locale } = parsed.data;

  const { error } = await supabase
    .from('users')
    .update({ preferred_locale: locale })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update locale' }, { status: 500 });
  }

  return NextResponse.json({ success: true, locale });
}

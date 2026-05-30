import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const setPinSchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/, 'PIN must be 4 digits'),
});

const verifyPinSchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json();
  const parsed = setPinSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid PIN' }, { status: 400 });
  }

  const hash = await bcrypt.hash(parsed.data.pin, 12);

  const { error } = await supabase
    .from('users')
    .update({ pin_hash: hash })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json();
  const parsed = verifyPinSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid PIN format' }, { status: 400 });
  }

  const { data: userData } = await supabase
    .from('users')
    .select('pin_hash')
    .eq('id', user.id)
    .single();

  if (!userData?.pin_hash) {
    return NextResponse.json({ error: 'No PIN set' }, { status: 404 });
  }

  const match = await bcrypt.compare(parsed.data.pin, userData.pin_hash);
  if (!match) {
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
  }

  return NextResponse.json({ verified: true });
}

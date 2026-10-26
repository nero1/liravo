import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const schema = z.object({
  bookId: z.string().uuid(),
  storeName: z.string(),
  isAffiliate: z.boolean(),
  linkType: z.string(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const user = await getCurrentUser();
  const userIdHash = user
    ? crypto.createHash('sha256').update(user.id).digest('hex')
    : null;

  const country = request.headers.get('cf-ipcountry') ?? 'US';

  await createServiceClient().from('affiliate_link_clicks').insert({
    book_id: parsed.data.bookId,
    user_id_hash: userIdHash,
    link_type: parsed.data.linkType,
    store_name: parsed.data.storeName,
    country,
    is_affiliate: parsed.data.isAffiliate,
  });

  return NextResponse.json({ ok: true });
}

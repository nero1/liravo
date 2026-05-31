import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isDigitalOcean } from '@/lib/db/provider';
import { SESSION_COOKIE, destroySession } from '@/lib/db/unified-client';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (isDigitalOcean()) {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) await destroySession(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // Supabase mode: client-side handles signOut via Supabase SDK.
  // This route is a no-op in Supabase mode — kept for API symmetry.
  return NextResponse.json({ ok: true });
}

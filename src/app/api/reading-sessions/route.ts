import {readingSessionPage} from '@/lib/content-history';
import {decodeCursor} from '@/lib/pagination';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const sessionSchema = z.object({
  book_id: z.string().uuid(),
  pages_read: z.number().int().min(1).max(9999).optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

// GET /api/reading-sessions?book_id=... — list user's sessions for a book
export async function GET(req:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const query=new URL(req.url).searchParams,book=query.get('book_id'),cursor=query.get('cursor');
 try{if(book&&!z.string().uuid().safeParse(book).success)throw Error();decodeCursor(cursor);}catch{return NextResponse.json({error:'Invalid history query'},{status:400});}
 try{return NextResponse.json(await readingSessionPage(user.id,book,cursor),{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({error:'Sessions unavailable'},{status:503});}
}

// POST /api/reading-sessions — log a reading session
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Insert session
  let session;
  try {
    const intent = await contentIntent(req, user.id, 'reading_sessions', { book_id: parsed.data.book_id, pages_read: parsed.data.pages_read ?? null, ...(parsed.data.started_at ? { started_at: parsed.data.started_at } : {}), ended_at: parsed.data.ended_at ?? null, notes: parsed.data.notes ?? null });
    session = await intent.insert();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Content creation unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }

  return NextResponse.json({ session }, { status: 201 });
}

import {getEditionIds} from '@/services/books';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase=createClient();
  let editionIds:string[];try{editionIds=await getEditionIds(params.id);}catch{return NextResponse.json({error:'Edition identities unavailable'},{status:503});}

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor');
  const limit = 20;

  let query = supabase
    .from('quotes')
    .select(`
      id, content, page_number, created_at,
      users:user_id (username, display_name, avatar_url)
    `)
    .in('book_id',editionIds)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: quotes, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasMore = (quotes?.length ?? 0) > limit;
  const results = hasMore ? quotes!.slice(0, limit) : (quotes ?? []);
  const nextCursor = hasMore ? results[results.length - 1]?.created_at ?? null : null;

  return NextResponse.json({ quotes: results, nextCursor });
}

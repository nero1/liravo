import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const CreateChainSchema = z.object({
  book_id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

// GET /api/pass-the-book/chains — list public chains with book + node summary
export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: chains, error } = await supabase
    .from('pass_the_book_chains')
    .select(`
      id, created_at,
      books:book_id(id, title, author_name, cover_url),
      nodes:pass_the_book_nodes(id, user_id, nominee_id, note, position, created_at,
        reader:user_id(id, display_name, username, avatar_url),
        nominee:nominee_id(id, display_name, username, avatar_url)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ chains: chains ?? [] });
}

// POST /api/pass-the-book/chains — start a new chain
export async function POST(request:Request) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=CreateChainSchema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
  try{return NextResponse.json(await applyCommunityIntent(request,user.id,'chain_create',parsed.data.book_id,{note:parsed.data.note??null}),{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}

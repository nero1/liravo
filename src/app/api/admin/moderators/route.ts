import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = (await createClient());
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  if (!data?.is_admin) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { data: moderators } = await service
    .from('users')
    .select('id, username, display_name, avatar_url, email, created_at')
    .eq('is_moderator', true)
    .order('created_at', { ascending: false });

  return NextResponse.json({ moderators: moderators ?? [] });
}

const PatchSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['grant', 'revoke']),
});

export async function POST(request:Request) {
  const admin=await requireAdmin();if(!admin)return NextResponse.json({error:'Forbidden'},{status:403});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=PatchSchema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
  try{
    await applyCommunityIntent(request,admin.id,'admin_user',parsed.data.userId,{is_moderator:parsed.data.action==='grant'});
    return NextResponse.json({ok:true,action:parsed.data.action});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}

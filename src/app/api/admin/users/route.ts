import {adminCatalogResponse} from '@/lib/admin-catalog';
import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  userId: z.string().uuid(),
  is_moderator: z.boolean().optional(),
  is_premium: z.boolean().optional(),
  is_suspended: z.boolean().optional(),
}).strict().refine(value=>['is_moderator','is_premium','is_suspended'].some(key=>key in value));

async function checkAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}

export const GET=(request:Request)=>adminCatalogResponse(request,'users','users');

export async function PATCH(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if(req.headers.has('X-Liravo-Actor')&&req.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {userId,...updates}=parsed.data;
  try{return NextResponse.json({...await applyCommunityIntent(req,user.id,'admin_user',userId,updates),actorId:user.id,userId});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}

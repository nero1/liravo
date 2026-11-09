import {z} from 'zod';
import { decodeCursor, encodeCursor, cursorFilter } from '@/lib/pagination';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = (await createClient());
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let cursor;
  try { cursor = decodeCursor(new URL(request.url).searchParams.get('cursor')); }
  catch { return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 }); }
  const query = supabase
    .from('notifications')
    .select('id,user_id,type,actor_id,entity_type,entity_id,message,message_key,message_values,is_read,created_at,actor:actor_id(id,display_name,avatar_url,username)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(51);
  if (cursor) query.or(cursorFilter('created_at', cursor));
  const { data: notifications, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (notifications ?? []).slice(0, 50);
  const last = rows.at(-1);
  return NextResponse.json({ actorId:user.id, notifications: rows, nextCursor: notifications?.length === 51 && last ? encodeCursor({ at: last.created_at, id: last.id }) : null },{headers:{'Cache-Control':'private, no-store'}});
}

export async function PATCH(request:Request) {
  const supabase = (await createClient());
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if(request.headers.get('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  let body:unknown;try{const raw=await request.text();body=raw?JSON.parse(raw):{};}catch{return NextResponse.json({error:'Invalid notification intent'},{status:400});}
  const parsed=z.object({notification_id:z.uuid().optional(),is_read:z.literal(true).optional()}).strict().safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Invalid notification intent'},{status:400});
  const query=supabase.from('notifications').update({is_read:true}).eq('user_id',user.id);
  const {data,error}=parsed.data.notification_id?await query.eq('id',parsed.data.notification_id).select('id'):await query.eq('is_read',false);
  if(!error&&parsed.data.notification_id&&!data?.length)return NextResponse.json({error:'Notification not found'},{status:404});

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true },{headers:{'Cache-Control':'private, no-store'}});
}

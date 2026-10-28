import {singleRelation} from '@/lib/utils';
import {resolveEditionMetadata} from '@/services/books';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decodeCursor,encodeCursor,cursorFilter } from '@/lib/pagination';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid shelf'},{status:400});
  let cursor;
  const search=new URL(request.url).searchParams;
  try{cursor=decodeCursor(search.get('cursor'));}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  const parsedLimit=z.coerce.number().int().min(1).max(100).safeParse(search.get('limit')??50);
  if(!parsedLimit.success)return NextResponse.json({error:'Invalid page size'},{status:400});
  const limit=parsedLimit.data;
  const db=createServiceClient();
  const {data:shelf,error}=await db.from('shelves').select('id,user_id,name,slug,is_default,default_type,is_public,description,created_at,updated_at').eq('id',params.id).maybeSingle();
  if(error)return NextResponse.json({error:'Shelf unavailable'},{status:503});
  if(!shelf)return NextResponse.json({error:'Shelf not found'},{status:404});
  if(shelf.user_id!==user.id){
    const {data:owner,error:ownerError}=await db.from('users').select('shelf_visibility,profile_visibility,is_banned,deleted_at').eq('id',shelf.user_id).single();
    if(ownerError)return NextResponse.json({error:'Shelf unavailable'},{status:503});
    if(!owner||owner.is_banned||owner.deleted_at||!shelf.is_public||owner.shelf_visibility==='private')return NextResponse.json({error:'Shelf is private'},{status:403});
    if(owner.shelf_visibility==='followers_only'||owner.profile_visibility==='followers_only'){
      const {data:follow,error:followError}=await db.from('follows').select('follower_id').eq('follower_id',user.id).eq('following_id',shelf.user_id).maybeSingle();
      if(followError)return NextResponse.json({error:'Shelf unavailable'},{status:503});
      if(!follow)return NextResponse.json({error:'Shelf is private'},{status:403});
    }
  }
  let query=db.from('shelf_books').select('*,book:books(*)').eq('shelf_id',shelf.id).eq('user_id',shelf.user_id).order('added_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1);
  if(cursor)query=query.or(cursorFilter('added_at',cursor));
  const {data:books,error:booksError}=await query;
  if(booksError)return NextResponse.json({error:'Shelf books unavailable'},{status:503});
  const page=(books??[]).slice(0,limit),last=page[page.length-1];
  const nextCursor=books&&books.length>limit&&last?encodeCursor({at:last.added_at,id:last.id}):null;
  const previews=page.map(entry=>singleRelation(entry.book)).filter((book):book is NonNullable<typeof book>=>!!book);
  let resolved:typeof previews;try{resolved=await resolveEditionMetadata(previews);}catch{return NextResponse.json({error:'Edition metadata unavailable'},{status:503});}
  const canonical=new Map(previews.map((book,index)=>[book.id,resolved[index]]));
  return NextResponse.json({shelf,books:page.map(entry=>({...entry,book:entry.book?canonical.get(singleRelation(entry.book)!.id)??singleRelation(entry.book):null,progress_percent:entry.progress_percent===null?null:Number(entry.progress_percent)})),nextCursor});
}

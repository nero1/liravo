import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {clientBook} from '@/lib/catalog-book';
import {MOOD_TAGS} from '@/constants/config';
import type {BookRow} from '@/types/database';

export const canonicalMood=(value:string)=>MOOD_TAGS.find(mood=>mood.toLowerCase()===value.toLowerCase());
export class MoodCursorError extends Error {}
const cursorSchema=z.object({mood:z.string(),count:z.number().int().positive().max(2147483647),id:z.uuid()});
export async function getMoodBooks(mood:string,cursor:string|null=null,limit=30){
  const canonical=canonicalMood(mood);
  if(canonical)mood=canonical;
  let after:z.infer<typeof cursorSchema>|undefined;
  if(!canonicalMood(mood)||!Number.isInteger(limit)||limit<1||limit>50)throw new MoodCursorError('Invalid mood page');
  if(cursor){
    try{if(cursor.length>1000||!/^[A-Za-z0-9_-]+$/.test(cursor))throw new Error();after=cursorSchema.parse(JSON.parse(Buffer.from(cursor,'base64url').toString()));if(after.mood!==mood)throw new Error();}
    catch{throw new MoodCursorError('Invalid mood cursor');}
  }
  const {data,error}=await createServiceClient().rpc('discover_mood_books' as never,{p_mood:mood,p_limit:limit,p_after_count:after?.count??null,p_after_id:after?.id??null} as never);
  if(error||!data||!Array.isArray((data as {books?:unknown}).books))throw new Error('Mood discovery unavailable');
  const page=data as {books:(BookRow&{mood_count:number})[];nextCursor:{count:number;id:string}|null};
  return {books:page.books.map(book=>({...clientBook(book),mood_count:book.mood_count})),nextCursor:page.nextCursor?Buffer.from(JSON.stringify({mood,...page.nextCursor})).toString('base64url'):null};
}

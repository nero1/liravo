import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {bookRating} from '@/lib/catalog-book';
import type {BookReviewPage} from '@/types/database';
const cursorSchema=z.object({book:z.uuid(),helpful:z.number().int().nonnegative(),at:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/).refine(value=>Number.isFinite(Date.parse(value))),id:z.uuid()});
export class ReviewCursorError extends Error{}
export async function getBookReviews(bookId:string,cursor:string|null=null,limit=50):Promise<BookReviewPage|null>{
  if(!z.uuid().safeParse(bookId).success||!Number.isInteger(limit)||limit<1||limit>50)throw new ReviewCursorError('Invalid review page');
  let after:z.infer<typeof cursorSchema>|undefined;
  if(cursor){try{if(cursor.length>1000||!/^[A-Za-z0-9_-]+$/.test(cursor))throw Error();after=cursorSchema.parse(JSON.parse(Buffer.from(cursor,'base64url').toString()));if(after.book!==bookId)throw Error();}catch{throw new ReviewCursorError('Invalid review cursor');}}
  const {data,error}=await createServiceClient().rpc('book_review_snapshot',{p_book_id:bookId,p_limit:limit,p_after_helpful:after?.helpful??null,p_after_created_at:after?.at??null,p_after_id:after?.id??null});
  if(error)throw new Error('Reviews unavailable');if(!data)return null;
  const page=data as Omit<BookReviewPage,'nextCursor'>&{nextCursor:Omit<z.infer<typeof cursorSchema>,'book'>|null};
  return {...page,statistics:{...page.statistics,average_rating:bookRating(page.statistics.average_rating)},nextCursor:page.nextCursor?Buffer.from(JSON.stringify({book:bookId,...page.nextCursor})).toString('base64url'):null};
}

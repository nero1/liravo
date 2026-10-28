import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {decodeCursor,encodeCursor} from '@/lib/pagination';

import {socialFeedItem} from './social-feed-contracts';
export type {SocialFeedItem} from './social-feed-contracts';
export class FeedCursorError extends Error{}
export async function getSocialFeed(userId:string,encoded?:string|null){
  let cursor;try{cursor=decodeCursor(encoded??null);if(cursor&&!['rv','sb'].includes(cursor.kind??''))throw new Error('Invalid kind');}catch{throw new FeedCursorError('Invalid feed cursor');}
  const {data,error}=await createServiceClient().rpc('read_social_feed' as never,{p_user_id:userId,p_at:cursor?.at??null,p_id:cursor?.id??null,p_kind:cursor?.kind??null,p_limit:20} as never),parsed=z.array(socialFeedItem).max(21).safeParse(data);
  if(error||!parsed.success)throw new Error('Feed unavailable');
  const items=parsed.data.slice(0,20),last=items[items.length-1];
  return {items,nextCursor:parsed.data.length>20&&last?encodeCursor({at:last.timestamp,id:last.id.slice(3),kind:last.type==='review'?'rv':'sb'}):null};
}

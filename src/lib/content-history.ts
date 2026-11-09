import {createServiceClient} from '@/lib/supabase/server';
import {getEditionIds} from '@/services/books';
import {profileVisibleTo} from '@/lib/profile-visibility';
import {decodeCursor,encodeCursor,cursorFilter} from '@/lib/pagination';
export type AuthorPost={id:string;title:string;body:string;type:string;book_id:string|null;created_at:string};
export type ReadingSession={id:string;book_id:string;pages_read:number|null;started_at:string;ended_at:string|null;notes:string|null;created_at:string};
export async function authorPostPage(authorId:string,viewer:string|null,cursor:string|null,limit=20){
 const before=decodeCursor(cursor);if(!await profileVisibleTo(authorId,viewer))throw Error('Author unavailable');
 let query=createServiceClient().from('author_posts').select('id,title,body,type,book_id,created_at').eq('author_id',authorId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1);
 if(before)query=query.or(cursorFilter('created_at',before));
 const {data,error}=await query;if(error||!Array.isArray(data))throw Error('Posts unavailable');
 const posts=(data as AuthorPost[]).slice(0,limit),last=posts.at(-1);return {posts,nextCursor:data.length>limit&&last?encodeCursor({at:last.created_at,id:last.id}):null};
}
export async function readingSessionPage(userId:string,bookId:string|null,cursor:string|null){
 const before=decodeCursor(cursor);let query=createServiceClient().from('reading_sessions').select('id,book_id,pages_read,started_at,ended_at,notes,created_at').eq('user_id',userId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
 if(bookId)query=query.in('book_id',await getEditionIds(bookId));if(before)query=query.or(cursorFilter('created_at',before));
 const {data,error}=await query;if(error||!Array.isArray(data))throw Error('Sessions unavailable');
 const sessions=(data as ReadingSession[]).slice(0,50),last=sessions.at(-1);return {actorId:userId,sessions,nextCursor:data.length>50&&last?encodeCursor({at:last.created_at,id:last.id}):null};
}

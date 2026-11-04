import {z} from 'zod';
import {getLocale,getTranslations} from 'next-intl/server';
import {createClient,createServiceClient} from '@/lib/supabase/server';
import type {BookRow} from '@/types/database';

export const SHARE_IMAGE_HEADERS={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
type ShareBook=Pick<BookRow,'id'|'title'|'author_name'|'cover_url'>;
type Reader={display_name:string;avatar_url:string|null};
type Review={content:string;rating:number};
type ShareSnapshots={book:ShareBook;finished:{book:ShareBook;reader:Reader;review:Review|null};shelf:{reader:Reader;books:ShareBook[]};quote:{content:string;book:ShareBook;reader:Reader};review:Review&{book:ShareBook;reader:Reader};challenge:{title:string;reader?:Reader;progress?:{booksFinished:number;pagesRead:number};completed?:boolean};'writing-challenge':{title:string;reader?:Reader;submissionCount?:number}};
export class ShareCardError extends Error{constructor(public status:number){super('Share unavailable');}}
export async function getShareCard<K extends keyof ShareSnapshots>(request:Request,kind:K,target:string,owner:string|null=null){
 const requestedLocale=new URL(request.url).searchParams.get('locale');
 if(!z.string().uuid().safeParse(target).success||(owner!==null&&!z.string().uuid().safeParse(owner).success)||(requestedLocale!==null&&!['en','fr','de'].includes(requestedLocale)))throw new ShareCardError(400);
 const locale=requestedLocale??await getLocale(),t=await getTranslations({locale,namespace:'shareCards'});
 const actor=kind==='book'?null:(await createClient().auth.getUser()).data.user?.id??null;
 const{data,error}=await createServiceClient().rpc('share_card_snapshot' as never,{p_kind:kind,p_target:target,p_owner:owner,p_actor:actor}as never);
 if(error)throw new ShareCardError(error.code==='P1003'?403:503);
 if(!data)throw new ShareCardError(404);
 return{data:data as ShareSnapshots[K],t,locale};
}
export function shareCardFailure(error:unknown){return new Response('Share unavailable',{status:error instanceof ShareCardError?error.status:503,headers:SHARE_IMAGE_HEADERS});}

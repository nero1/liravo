import {z} from 'zod';
import {getLocale,getTranslations} from 'next-intl/server';
import {createClient,createServiceClient} from '@/lib/supabase/server';
import type {BookRow} from '@/types/database';

export const SHARE_IMAGE_HEADERS={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
type ShareBook=Pick<BookRow,'id'|'title'|'author_name'|'cover_url'>;
type Reader={display_name:string;avatar_url:string|null};
type Review={content:string;rating:number};
type ShareSnapshots={book:ShareBook;finished:{book:ShareBook;reader:Reader;review:Review|null};shelf:{reader:Reader;books:ShareBook[]};quote:{content:string;book:ShareBook;reader:Reader};review:Review&{book:ShareBook;reader:Reader};challenge:{title:string;reader?:Reader;progress?:{booksFinished:number;pagesRead:number};completed?:boolean};'writing-challenge':{title:string;reader?:Reader;submissionCount?:number}};
const bookSchema=z.object({id:z.uuid(),title:z.string(),author_name:z.string(),cover_url:z.string().nullable()}),readerSchema=z.object({display_name:z.string(),avatar_url:z.string().nullable()}),reviewSchema=z.object({content:z.string(),rating:z.number()});
const snapshotSchemas:{[K in keyof ShareSnapshots]:z.ZodType<ShareSnapshots[K]>}={book:bookSchema,finished:z.object({book:bookSchema,reader:readerSchema,review:reviewSchema.nullable()}),shelf:z.object({reader:readerSchema,books:z.array(bookSchema)}),quote:z.object({content:z.string(),book:bookSchema,reader:readerSchema}),review:reviewSchema.extend({book:bookSchema,reader:readerSchema}),challenge:z.object({title:z.string(),reader:readerSchema.optional(),progress:z.object({booksFinished:z.number(),pagesRead:z.number()}).optional(),completed:z.boolean().optional()}),'writing-challenge':z.object({title:z.string(),reader:readerSchema.optional(),submissionCount:z.number().optional()})};
export class ShareCardError extends Error{constructor(public status:number){super('Share unavailable');}}
export async function getShareCard<K extends keyof ShareSnapshots>(request:Request,kind:K,target:string,owner:string|null=null){
 const requestedLocale=new URL(request.url).searchParams.get('locale');
 if(!z.string().uuid().safeParse(target).success||(owner!==null&&!z.string().uuid().safeParse(owner).success)||(requestedLocale!==null&&!['en','fr','de'].includes(requestedLocale)))throw new ShareCardError(400);
 const locale=requestedLocale??await getLocale(),t=await getTranslations({locale,namespace:'shareCards'});
 const actor=kind==='book'?null:(await (await createClient()).auth.getUser()).data.user?.id??null;
 const{data,error}=await createServiceClient().rpc('share_card_snapshot',{p_kind:kind,p_target:target,p_owner:owner,p_actor:actor});
 if(error)throw new ShareCardError(error.code==='P1003'?403:503);
 if(!data)throw new ShareCardError(404);
 const parsed=snapshotSchemas[kind].safeParse(data);if(!parsed.success)throw new ShareCardError(503);return{data:parsed.data,t,locale};
}
export function shareCardFailure(error:unknown){return new Response('Share unavailable',{status:error instanceof ShareCardError?error.status:503,headers:SHARE_IMAGE_HEADERS});}

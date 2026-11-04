import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import type {AuthorQuestion,AuthorQuestionPage} from '@/types/database';
export class AuthorQuestionError extends Error{constructor(message:string,public status:number){super(message);}}
const cursorSchema=z.object({authorId:z.string().uuid(),at:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export async function getAuthorQuestions(authorId:string,raw:string|null=null):Promise<AuthorQuestionPage>{
 if(!z.string().uuid().safeParse(authorId).success)throw new AuthorQuestionError('Invalid author',400);let cursor:z.infer<typeof cursorSchema>|null=null;
 if(raw)try{if(raw.length>1000)throw Error();cursor=cursorSchema.parse(JSON.parse(Buffer.from(raw,'base64url').toString()));if(cursor.authorId!==authorId)throw Error();}catch{throw new AuthorQuestionError('Invalid question cursor',400);}
 const{data,error}=await createServiceClient().rpc('author_question_snapshot'as never,{p_author:authorId,p_at:cursor?.at??null,p_id:cursor?.id??null,p_limit:20}as never);if(error||!data)throw new AuthorQuestionError('Questions unavailable',({P1003:403,P1004:400,P1005:404}as Record<string,number>)[error?.code??'']??503);
 const snapshot=data as{qa:(AuthorQuestion&{cursor_at:string})[];total:number},qa=snapshot.qa.slice(0,20),last=qa.at(-1);return{qa:qa.map(({cursor_at,...item})=>{if(!cursorSchema.shape.at.safeParse(cursor_at).success)throw new AuthorQuestionError('Questions unavailable',503);return item;}),total:snapshot.total,authorId,nextCursor:snapshot.qa.length>20&&last?Buffer.from(JSON.stringify({authorId,at:last.cursor_at,id:last.id})).toString('base64url'):null};
}

import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import type {AuthorQuestion,AuthorQuestionPage} from '@/types/database';
import {richTextPlain} from '@/lib/sanitize';
export class AuthorQuestionError extends Error{constructor(message:string,public status:number){super(message);}}
const cursorSchema=z.object({authorId:z.string().uuid(),at:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export async function getAuthorQuestions(authorId:string,raw:string|null=null):Promise<AuthorQuestionPage>{
 if(!z.string().uuid().safeParse(authorId).success)throw new AuthorQuestionError('Invalid author',400);let cursor:z.infer<typeof cursorSchema>|null=null;
 if(raw)try{if(raw.length>1000)throw Error();cursor=cursorSchema.parse(JSON.parse(Buffer.from(raw,'base64url').toString()));if(cursor.authorId!==authorId)throw Error();}catch{throw new AuthorQuestionError('Invalid question cursor',400);}
 const{data,error}=await createServiceClient().rpc('author_question_snapshot'as never,{p_author:authorId,p_at:cursor?.at??null,p_id:cursor?.id??null,p_limit:20}as never);if(error||!data)throw new AuthorQuestionError('Questions unavailable',({P1003:403,P1004:400,P1005:404}as Record<string,number>)[error?.code??'']??503);
 const snapshot=data as{qa:(AuthorQuestion&{cursor_at:string})[];total:number},qa=snapshot.qa.slice(0,20),last=qa.at(-1);return{qa:qa.map(({cursor_at,...item})=>{if(!cursorSchema.shape.at.safeParse(cursor_at).success)throw new AuthorQuestionError('Questions unavailable',503);return readableAuthorQuestion(item);}),total:snapshot.total,authorId,nextCursor:snapshot.qa.length>20&&last?Buffer.from(JSON.stringify({authorId,at:last.cursor_at,id:last.id})).toString('base64url'):null};
}

const ownerCursor=cursorSchema.extend({state:z.enum(['all','unanswered','answered'])});
export type OwnedAuthorQuestion=AuthorQuestion&{is_public:boolean};
export function readableAuthorQuestion<T extends AuthorQuestion>(qa:T){return{...qa,answer_text:qa.answer===null?null:richTextPlain(qa.answer)};}
export type AuthorQuestionQueue={qa:OwnedAuthorQuestion[];total:number;unanswered:number;answered:number;actorId:string;state:string;nextCursor:string|null};
export async function getAuthorQuestionQueue(actorId:string,state='all',raw:string|null=null):Promise<AuthorQuestionQueue>{
 if(!['all','unanswered','answered'].includes(state))throw new AuthorQuestionError('Invalid filter',400);let cursor:z.infer<typeof ownerCursor>|null=null;
 if(raw)try{if(raw.length>1000)throw Error();cursor=ownerCursor.parse(JSON.parse(Buffer.from(raw,'base64url').toString()));if(cursor.authorId!==actorId||cursor.state!==state)throw Error();}catch{throw new AuthorQuestionError('Invalid question cursor',400);}
 const{data,error}=await createServiceClient().rpc('author_question_owner_snapshot'as never,{p_user:actorId,p_state:state,p_at:cursor?.at??null,p_id:cursor?.id??null,p_limit:20}as never);
 if(error||!data)throw new AuthorQuestionError('Questions unavailable',({P1003:403,P1004:400}as Record<string,number>)[error?.code??'']??503);
 const snapshot=data as{qa:OwnedAuthorQuestion[];total:number;unanswered:number;answered:number},qa=snapshot.qa.slice(0,20),last=qa.at(-1);
 return{...snapshot,qa:qa.map(readableAuthorQuestion),actorId,state,nextCursor:snapshot.qa.length>20&&last?Buffer.from(JSON.stringify({authorId:actorId,state,at:last.created_at,id:last.id})).toString('base64url'):null};
}
export type AuthorAnswerReceipt={ok:true;actorId:string;requestKey:string;qa:OwnedAuthorQuestion};
export async function getAuthorAnswerReceipt(actorId:string,questionId:string,key:string){
 if(!z.string().uuid().safeParse(questionId).success||key.length<8||key.length>200)throw new AuthorQuestionError('Invalid receipt',400);
 const{data,error}=await createServiceClient().rpc('author_answer_receipt_snapshot'as never,{p_user:actorId,p_question:questionId,p_key:key}as never);
 if(error||!data)throw new AuthorQuestionError('Receipt unavailable',({P1003:403,P1004:400,P1005:404}as Record<string,number>)[error?.code??'']??503);
 const receipt=data as AuthorAnswerReceipt;return{...receipt,qa:readableAuthorQuestion(receipt.qa)};
}

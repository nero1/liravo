import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {decodeCursor} from '@/lib/pagination';
export const questionFilter=z.enum(['all','unanswered','most_answered']);
import type {QuestionFilter,WriterQuestion,WriterThread} from '@/types/database';
export type {QuestionFilter,Writer,WriterQuestion,WriterAnswer,WriterThread} from '@/types/database';
const listCursor=z.object({filter:questionFilter,at:z.string().datetime({offset:true}),id:z.string().uuid(),count:z.number().int().nonnegative()}).strict();
export function questionListCursor(value:string|null,filter:QuestionFilter){
  if(!value)return null;if(value.length>500)throw Error('Invalid cursor');const cursor=listCursor.parse(JSON.parse(Buffer.from(value,'base64url').toString()));if(cursor.filter!==filter)throw Error('Invalid cursor');return cursor;
}
export function answerCursor(value:string|null,questionId:string){
  if(!value)return null;if(value.length>500)throw Error('Invalid cursor');const parsed=JSON.parse(Buffer.from(value,'base64url').toString());if(parsed.questionId!==questionId)throw Error('Invalid cursor');return decodeCursor(Buffer.from(JSON.stringify({at:parsed.at,id:parsed.id})).toString('base64url'));
}
export async function getWriterQuestions(filter:QuestionFilter,cursor:string|null=null){
  const before=questionListCursor(cursor,filter),limit=20,{data,error}=await createServiceClient().rpc('writer_question_catalog' as never,{p_filter:filter,p_cursor:before,p_limit:limit} as never);
  if(error||!data)throw Error('Writer questions unavailable');const snapshot=data as {questions:WriterQuestion[];total:number},questions=snapshot.questions.slice(0,limit),last=questions.at(-1);
  return {questions,total:snapshot.total,nextCursor:snapshot.questions.length>limit&&last?Buffer.from(JSON.stringify({filter,at:last.created_at,id:last.id,count:last.answer_count})).toString('base64url'):null};
}
export async function getWriterThread(questionId:string,viewer:string|null,cursor:string|null=null):Promise<WriterThread|null>{
  const before=answerCursor(cursor,questionId),limit=20,{data,error}=await createServiceClient().rpc('writer_question_thread' as never,{p_question:questionId,p_viewer:viewer,p_before:before?.at??null,p_id:before?.id??null,p_limit:limit} as never);
  if(error)throw Error('Writer question unavailable');if(!data)return null;
  const snapshot=data as WriterThread,answers=snapshot.answers.slice(0,limit),last=answers.at(-1);
  const nextCursor=snapshot.answers.length>limit&&last?Buffer.from(JSON.stringify({questionId,at:last.created_at,id:last.id})).toString('base64url'):null;
  return {...snapshot,answers,nextCursor};
}

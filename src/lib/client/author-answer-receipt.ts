import type {AuthorAnswerReceipt} from '@/lib/author-questions';
export function validAuthorAnswerReceipt(value:unknown,actorId:string,questionId:string,key:string):value is AuthorAnswerReceipt{
 const receipt=value as AuthorAnswerReceipt;return!!receipt&&receipt.ok===true&&receipt.actorId===actorId&&receipt.requestKey===key&&receipt.qa?.id===questionId&&receipt.qa.author_id===actorId&&typeof receipt.qa.question==='string'&&typeof receipt.qa.is_public==='boolean'&&Number.isFinite(Date.parse(receipt.qa.created_at))&&typeof receipt.qa.answer==='string'&&receipt.qa.answer.length>0&&typeof receipt.qa.answered_at==='string'&&Number.isFinite(Date.parse(receipt.qa.answered_at));
}
export async function recoverAuthorAnswer(actorId:string,questionId:string,headers:Record<string,string>,signal?:AbortSignal){
 const key=headers['Idempotency-Key'];if(!key)throw Error('Missing answer intent');
 const response=await fetch('/api/author/qa/answer?'+new URLSearchParams({qa_id:questionId,receipt:key}),{headers:{...headers,'X-Liravo-Actor':actorId},signal,cache:'no-store'});
 if(response.status===404)return null;const receipt=await response.json();if(!response.ok||!validAuthorAnswerReceipt(receipt,actorId,questionId,key))throw Error('Answer receipt unavailable');return receipt;
}

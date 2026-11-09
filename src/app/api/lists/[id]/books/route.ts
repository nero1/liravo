import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {mutateReadingList,listError} from '@/lib/reading-lists';
export const dynamic='force-dynamic';
const book=z.object({book_id:z.string().uuid()}).strict();
async function mutate(request:NextRequest,id:string,action:'add'|'remove'){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Invalid list'},{status:400});
  const parsed=book.safeParse(action==='add'?await request.json().catch(()=>null):{book_id:new URL(request.url).searchParams.get('book_id')});if(!parsed.success)return NextResponse.json({error:'Invalid edition'},{status:400});
  try{return NextResponse.json({success:true,...(await mutateReadingList(user.id,id,action,parsed.data))},{status:action==='add'?201:200});}catch(error){const result=listError(error);return NextResponse.json({error:result.error},{status:result.status});}
}
export async function POST(request:NextRequest, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  return mutate(request,params.id,'add');
}
export async function DELETE(request:NextRequest, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  return mutate(request,params.id,'remove');
}

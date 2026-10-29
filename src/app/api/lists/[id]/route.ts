import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingList,mutateReadingList,listError} from '@/lib/reading-lists';
export const dynamic='force-dynamic';
const update=z.object({name:z.string().trim().min(1).max(100).optional(),description:z.string().trim().max(500).optional(),is_public:z.boolean().optional()}).strict().refine(value=>Object.keys(value).length>0);
function failed(error:unknown){const result=listError(error);return NextResponse.json({error:result.error},{status:result.status});}
export async function GET(request:NextRequest,{params}:{params:{id:string}}){
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid list'},{status:400});
  const user=await getCurrentUser();try{return NextResponse.json(await getReadingList(user?.id??null,params.id,new URL(request.url).searchParams.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failed(error);}
}
export async function PATCH(request:NextRequest,{params}:{params:{id:string}}){return mutate(request,params.id,'update');}
export async function DELETE(request:NextRequest,{params}:{params:{id:string}}){return mutate(request,params.id,'delete');}
async function mutate(request:Request,id:string,action:'update'|'delete'){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Invalid list'},{status:400});
  const body=action==='update'?update.safeParse(await request.json().catch(()=>null)):{success:true as const,data:{}};if(!body.success)return NextResponse.json({error:'Invalid update'},{status:400});
  try{return NextResponse.json({success:true,...await mutateReadingList(user.id,id,action,body.data)});}catch(error){return failed(error);}
}

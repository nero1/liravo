import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createHash} from 'crypto';
import {createServiceClient} from '@/lib/supabase/server';
import {LOCALES} from '@/constants/config';
export const dynamic='force-dynamic';
const tokenSchema=z.string().regex(/^[a-f0-9]{64}$/),headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export async function GET(request:Request){
 const query=new URL(request.url).searchParams,url=new URL('/email/unsubscribe',process.env.NEXT_PUBLIC_APP_URL??'https://liravo.org');url.searchParams.set('lang',LOCALES.find(locale=>locale===query.get('lang'))??'en');const token=query.get('token');if(tokenSchema.safeParse(token).success)url.hash=new URLSearchParams({token:token!}).toString();const response=NextResponse.redirect(url,303);for(const[key,value]of Object.entries(headers))response.headers.set(key,value);return response;
}
export async function POST(request:Request){
 const raw=await request.text();if(raw.length>1000)return NextResponse.json({error:'Invalid request'},{status:413,headers});
 let token:unknown;
 if(request.headers.get('Content-Type')?.includes('application/json')){try{const parsed=z.object({token:tokenSchema}).strict().parse(JSON.parse(raw));token=parsed.token;}catch{return NextResponse.json({error:'Invalid link'},{status:410,headers});}}
 else if(request.headers.get('Content-Type')?.includes('application/x-www-form-urlencoded')&&new URLSearchParams(raw).get('List-Unsubscribe')==='One-Click')token=new URL(request.url).searchParams.get('token');
 if(!tokenSchema.safeParse(token).success)return NextResponse.json({error:'Invalid link'},{status:410,headers});
 try{const{data,error}=await createServiceClient().rpc('consume_email_unsubscribe',{p_hash:createHash('sha256').update(token as string).digest('hex')});if(error)return NextResponse.json({error:'Unsubscribe unavailable'},{status:503,headers});if(data!==true)return NextResponse.json({error:'Invalid link'},{status:410,headers});return NextResponse.json({ok:true},{headers});}
 catch{return NextResponse.json({error:'Unsubscribe unavailable'},{status:503,headers});}
}

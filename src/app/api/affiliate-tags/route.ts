import {NextRequest,NextResponse} from 'next/server';
import {createServiceClient} from '@/lib/supabase/server';
import {z} from 'zod';
export const dynamic='force-dynamic';
const countrySchema=z.string().regex(/^[A-Za-z]{2}$/).transform(value=>value.toUpperCase()==='UK'?'GB':value.toUpperCase());
export async function GET(request:NextRequest){
 const parsed=countrySchema.safeParse(new URL(request.url).searchParams.get('country'));
 if(!parsed.success)return NextResponse.json({error:'Invalid country'},{status:400});
 const country=parsed.data,{data,error}=await createServiceClient().from('affiliate_stores').select('id,countries,affiliate_tag,is_non_affiliate').eq('is_active',true).order('priority',{ascending:true}).order('id',{ascending:true});
 if(error)return NextResponse.json({error:'Stores unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 const store=data?.find(store=>!store.is_non_affiliate&&store.affiliate_tag&&(!store.countries.length||store.countries.includes(country)));
 return NextResponse.json({country,tag:store?.affiliate_tag??null},{headers:{'Cache-Control':'no-store'}});
}

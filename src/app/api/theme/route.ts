import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeThemeCss } from '@/lib/theme-css';

export const dynamic='force-dynamic';
export async function GET(){
  try{
    const {data,error}=await createServiceClient().from('custom_themes').select('css_overrides').eq('is_active',true).maybeSingle();
    if(error)throw new Error('Theme unavailable');
    return NextResponse.json({css:data?normalizeThemeCss(data.css_overrides):''},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Theme unavailable'},{status:503});}
}

import { createServiceClient } from '@/lib/supabase/server';
import { recordMetric } from '@/lib/metrics';
export interface PromotedBook {listing_id:string;id:string;title:string;author_name:string;cover_url:string|null;}
export async function getActivePromotions(placement:'discover_top'|'book_page_sidebar',excludeBook?:string):Promise<PromotedBook[]>{
  const now=new Date().toISOString();
  let query=createServiceClient().from('promoted_listings').select('id,book_id,book:books(id,title,author_name,cover_url)').eq('placement',placement).eq('is_active',true).lte('start_date',now).gt('end_date',now).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(5);
  if(excludeBook)query=query.neq('book_id',excludeBook);
  const {data,error}=await query;
  if(error){recordMetric('promotion_lookup_failed',{placement},'error');return [];}
  return ((data??[]) as unknown as {id:string;book:Omit<PromotedBook,'listing_id'>|null}[]).flatMap(row=>row.book?[{...row.book,listing_id:row.id}]:[]);
}

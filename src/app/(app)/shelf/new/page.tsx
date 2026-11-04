import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewShelfForm } from '@/components/shelf/NewShelfForm';
import {getTranslations} from 'next-intl/server';
import {hasPremiumAccess} from '@/lib/premium-access';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export async function generateMetadata(){const t=await getTranslations('shelfForm');return{title:t('title'),robots:{index:false,follow:false}};}

export default async function NewShelfPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const t=await getTranslations('shelfForm'),common=await getTranslations('common');
  let customShelfCount:number,isPremium:boolean;
  try{
    const [shelves,premium]=await Promise.all([supabase.from('shelves').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('is_default',false),hasPremiumAccess(user.id)]);
    if(shelves.error||typeof shelves.count!=='number')throw Error();customShelfCount=shelves.count;isPremium=premium;
  }catch{return <div className="max-w-lg mx-auto px-4 py-6"><h1 className="font-display text-2xl font-bold">{t('title')}</h1><p role="alert">{t('loadFailed')}</p><Link href="/shelf/new" className="underline">{common('retry')}</Link></div>;}

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{t('title')}</h1>
      <NewShelfForm userId={user.id} customShelfCount={customShelfCount} isPremium={isPremium} />
    </div>
  );
}

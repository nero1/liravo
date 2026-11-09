import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isAdmin} from '@/lib/moderation';
import {createServiceClient} from '@/lib/supabase/server';
import {redirect,notFound} from 'next/navigation';
import {z} from 'zod';
import {SeasonalEventForm} from '../../SeasonalEventForm';

export const dynamic='force-dynamic';
export default async function EditSeasonalEventPage(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)redirect('/login');if(!(await isAdmin(user.id)))redirect('/');
  if(!z.string().uuid().safeParse(params.id).success)notFound();
  const {data,error}=await createServiceClient().from('seasonal_events').select('id,name,theme,start_date,end_date,badge_name,is_published').eq('id',params.id).maybeSingle();
  if(error)throw new Error('Event unavailable');if(!data)notFound();
  return <SeasonalEventForm event={{...data,start_date:new Date(data.start_date).toISOString(),end_date:new Date(data.end_date).toISOString()}}/>;
}

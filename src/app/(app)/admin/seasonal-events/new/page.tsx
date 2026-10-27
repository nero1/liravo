import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isAdmin} from '@/lib/moderation';
import {redirect} from 'next/navigation';
import {SeasonalEventForm} from '../SeasonalEventForm';

export default async function NewSeasonalEventPage(){
  const user=await getCurrentUser();if(!user)redirect('/login');if(!await isAdmin(user.id))redirect('/');
  return <SeasonalEventForm/>;
}

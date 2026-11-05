import {redirect} from 'next/navigation';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isModerator} from '@/lib/moderation';
import {ReviewModerationQueue} from '@/components/moderation/ReviewModerationQueue';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getCurrentUser();if(!user||!await isModerator(user.id))redirect('/');return <div className="max-w-3xl mx-auto p-6"><ReviewModerationQueue key={user.id} actorId={user.id}/></div>;}

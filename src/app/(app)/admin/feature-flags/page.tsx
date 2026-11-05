import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import FeatureFlags from '@/components/admin/FeatureFlags';

export default async function AdminFeatureFlagsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <FeatureFlags key={user.id} actorId={user.id} />;
}

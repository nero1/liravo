import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewShelfForm } from '@/components/shelf/NewShelfForm';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'New Shelf' };

export default async function NewShelfPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Count current custom shelves for free tier enforcement
  const { count } = await supabase
    .from('shelves')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_default', false);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">New Shelf</h1>
      <NewShelfForm userId={user.id} customShelfCount={count ?? 0} />
    </div>
  );
}

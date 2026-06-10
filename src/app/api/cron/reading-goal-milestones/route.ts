import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MILESTONES = [25, 50, 75, 100];
const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31T23:59:59`;

  const { data: users } = await supabase
    .from('users')
    .select('id, annual_reading_goal')
    .not('annual_reading_goal', 'is', null)
    .gt('annual_reading_goal', 0);

  if (!users || users.length === 0) return NextResponse.json({ checked: 0, milestonesAwarded: 0 });

  let checked = 0;
  let milestonesAwarded = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (user) => {
      const { data: shelves } = await supabase
        .from('shelves')
        .select('id')
        .eq('user_id', user.id)
        .eq('default_type', 'have_read');

      if (!shelves || shelves.length === 0) return;

      const { count: booksRead } = await supabase
        .from('shelf_books')
        .select('*', { count: 'exact', head: true })
        .in('shelf_id', shelves.map((s) => s.id))
        .gte('finished_at', yearStart)
        .lte('finished_at', yearEnd);

      const goal = user.annual_reading_goal as number;
      const percent = ((booksRead ?? 0) / goal) * 100;

      for (const milestone of MILESTONES) {
        if (percent < milestone) continue;

        const { data: existing } = await supabase
          .from('reading_goal_milestones')
          .select('id')
          .eq('user_id', user.id)
          .eq('year', currentYear)
          .eq('milestone_percent', milestone)
          .maybeSingle();

        if (existing) continue;

        await supabase.from('reading_goal_milestones').insert({
          user_id: user.id,
          year: currentYear,
          milestone_percent: milestone,
        });

        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'reading_goal_milestone',
          message: `You've read ${booksRead} of ${goal} books — you've hit ${milestone}% of your ${currentYear} reading goal!`,
        });

        milestonesAwarded++;
      }

      checked++;
    }));
  }

  return NextResponse.json({ checked, milestonesAwarded });
}

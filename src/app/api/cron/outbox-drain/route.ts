import { NextResponse } from 'next/server';
import { drainOutbox } from '@/lib/outbox-worker';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batch = Number(req.headers.get('x-outbox-batch') ?? '50');
  const batchSize = Number.isFinite(batch) ? Math.min(200, Math.max(1, batch)) : 50;

  const result = await drainOutbox(batchSize);
  return NextResponse.json(result);
}

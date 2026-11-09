import { NextResponse } from 'next/server';
import {withRedisLock,withDatabaseFence,leaseSignal}from '@/lib/locks';
import {createServiceClient}from '@/lib/supabase/server';
import {randomUUID}from 'node:crypto';
import { recordMetric } from '@/lib/metrics';
import { getRequestCorrelationId } from '@/lib/utils';
import { observeOperationalSignal } from '@/lib/operational-alerts';

/** Serializes each job for its full runtime; errors stay retryable by the scheduler. */
export function cron(name: string, task: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const correlationId = getRequestCorrelationId(request);
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized', code: 'CRON_UNAUTHORIZED', correlationId }, { status: 401, headers: { 'x-request-id': correlationId } });
    }
    const headers = new Headers(request.headers);
    headers.set('x-request-id',correlationId);
    const forwarded = new Request(request,{headers});
    const started = Date.now();
    try {
      const result=await withRedisLock(`cron:${name}`,120,async()=>{
        const service=createServiceClient(),owner=randomUUID(),{data,error}=await service.rpc('claim_maintenance_job',{p_name:name,p_owner:owner});
        if(error)throw new Error('Job claim unavailable');if(!data)return null;
        const fence=data as {name:string;owner:string;epoch:number};
        if(fence.name!==name||fence.owner!==owner||!Number.isSafeInteger(fence.epoch)||fence.epoch<1)throw new Error('Invalid job claim');
        const signal=AbortSignal.any([AbortSignal.timeout(50000),request.signal,...(leaseSignal()?[leaseSignal()!]:[])]);
        try{return await withDatabaseFence(fence,()=>task(new Request(forwarded,{signal})));}
        finally{const {error:releaseError}=await service.rpc('release_maintenance_job',{p_name:name,p_owner:owner,p_epoch:fence.epoch});if(releaseError)throw new Error('Job release unavailable');}
      });
      if (!result) await observeOperationalSignal('cronOverlaps',correlationId);
      else if (!result.ok) await observeOperationalSignal('cronFailures',correlationId);
      recordMetric('cron_run', { name, correlationId, durationMs: Date.now() - started, overlap: !result });
      const response = result ?? NextResponse.json({ error: 'Job already running', code: 'CRON_OVERLAP', correlationId }, { status: 409 });
      response.headers.set('x-request-id',correlationId);
      return response;
    } catch {
      recordMetric('cron_error', { name, correlationId }, 'error');
      await observeOperationalSignal('cronFailures',correlationId);
      return NextResponse.json({ error: 'Job failed', code: 'CRON_DEPENDENCY_FAILURE', correlationId }, { status: 503, headers: { 'x-request-id': correlationId } });
    }
  };
}

/** Completes each bounded batch before scheduling more work; rejections propagate. */
export async function mapBatches<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>, deadline = Infinity) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) throw new Error('Invalid concurrency');
  let completed = 0;
  for (let i = 0; i < items.length && Date.now() < deadline; i += concurrency) {
    leaseSignal()?.throwIfAborted();
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(task));
    completed += batch.length;
  }
  return completed;
}

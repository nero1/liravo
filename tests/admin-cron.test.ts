import { createServiceClient } from '@/lib/supabase/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { GET, POST } from '@/app/api/admin/cron-status/route';
import { POST as drain } from '@/app/api/cron/outbox-drain/route';
import { CRON_JOBS, INTEGRITY_SIGNALS } from '@/constants/cron';
import vercel from '../vercel.json';
import { createTranslator } from 'next-intl';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import de from '../messages/de.json';

vi.mock('@/lib/supabase/server', () => ({createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser', () => ({getCurrentUser:vi.fn()}));
vi.mock('@/lib/moderation', () => ({isAdmin:vi.fn()}));
vi.mock('@/lib/operational-alerts',()=>({operationalSnapshot:vi.fn().mockResolvedValue(null)}));
vi.mock('@/lib/metrics', () => ({recordMetric:vi.fn()}));
vi.mock('@/app/api/cron/outbox-drain/route', () => ({POST:vi.fn()}));

beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
const request=(job: string) => new Request('https://app.test/api/admin/cron-status',{method:'POST',body:JSON.stringify({job}),headers:{authorization:'Bearer attacker-value','x-request-id':'admin-test-request'}});

it('rejects anonymous and non-admin job requests before loading a handler', async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await POST(request('outbox-drain'))).status).toBe(401);
  expect(isAdmin).not.toHaveBeenCalled();
  vi.mocked(getCurrentUser).mockResolvedValue({id:'user',email:''});
  vi.mocked(isAdmin).mockResolvedValue(false);
  expect((await POST(request('outbox-drain'))).status).toBe(403);
  expect(drain).not.toHaveBeenCalled();
});

it('uses only the server cron credential and preserves correlation on authorized requests', async () => {
  vi.stubEnv('CRON_SECRET','server-only-test-secret');
  vi.mocked(getCurrentUser).mockResolvedValue({id:'admin',email:''});
  vi.mocked(isAdmin).mockResolvedValue(true);
  vi.mocked(drain).mockResolvedValue(new Response('{"processed":1}'));
  const response=await POST(request('outbox-drain'));
  expect(response.status).toBe(200);
  const forwarded=vi.mocked(drain).mock.calls[0][0];
  expect(forwarded.headers.get('authorization')).toBe('Bearer server-only-test-secret');
  expect(forwarded.headers.get('x-request-id')).toBe('admin-test-request');
  expect(await response.text()).not.toContain('server-only-test-secret');
  vi.mocked(drain).mockResolvedValue(new Response('{"failed":1}'));
  expect(await (await POST(request('outbox-drain'))).json()).toMatchObject({partial:true});
  expect((await POST(request('__proto__'))).status).toBe(400);
  vi.stubEnv('CRON_SECRET','');
  expect((await POST(request('outbox-drain'))).status).toBe(503);
});

it('keeps the admin schedule registry aligned with deployed jobs and daily-or-less schedules', () => {
  const deployed=CRON_JOBS.filter(job=>job.schedule).map(job=>({path:`/api/cron/${job.id}`,schedule:job.schedule}));
  expect(deployed.sort((a,b)=>a.path.localeCompare(b.path))).toEqual([...vercel.crons].sort((a,b)=>a.path.localeCompare(b.path)));
  for(const {schedule} of deployed) expect(schedule!.split(' ').slice(0,2).every(part=>/^\d+$/.test(part))).toBe(true);
  for(const [locale,messages] of Object.entries({en,fr,de})) {
    const t=createTranslator({locale,messages,onError:error=>{throw error;}});
    for(const job of CRON_JOBS) {
      expect(t(`admin.cron.jobs.${job.id}.label`)).toBeTruthy();
      expect(t(`admin.cron.jobs.${job.id}.description`)).toBeTruthy();
    }
  }
});

it('reports unavailable status instead of displaying failed queries as zero', async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({id:'admin',email:''});
  vi.mocked(isAdmin).mockResolvedValue(true);
  const client={
    from:()=>({select:()=>({eq:(_column:string,status:string)=>Promise.resolve({count:status==='pending'?3:1,error:null})})}),
    rpc:vi.fn().mockResolvedValue({data:Object.fromEntries(INTEGRITY_SIGNALS.map(name=>[name,name==='failedOutbox'?1:0])),error:null}),
  };
  vi.mocked(createServiceClient).mockReturnValue(client as unknown as ReturnType<typeof createServiceClient>);
  const response=await GET(request('outbox-drain'));
  expect(await response.json()).toMatchObject({pending:3,failed:1,anomalies:{failedOutbox:1}});
  client.rpc.mockResolvedValue({data:null,error:{message:'Database unavailable'}});
  expect((await GET(request('outbox-drain'))).status).toBe(503);
});

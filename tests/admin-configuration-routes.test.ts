import {beforeEach,expect,it,vi} from 'vitest';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/moderation';
import {applyAdminConfiguration} from '@/lib/admin-configuration';
import {ContentIntentError} from '@/lib/content-intents';
import {POST as themePost,PATCH as themePatch} from '@/app/api/admin/themes/route';
import {POST as seasonPost} from '@/app/api/admin/seasonal-events/route';
import {POST as storePost} from '@/app/api/admin/affiliate-stores/route';
vi.mock('@/lib/moderation',()=>({requireAdmin:vi.fn()}));
vi.mock('@/lib/admin-configuration',()=>({applyAdminConfiguration:vi.fn()}));
const user='00000000-0000-4000-8000-000000002001';
const request=(body:unknown)=>new Request('https://app.test/api/admin/config',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'configuration-route-intent'},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireAdmin).mockResolvedValue({userId:user});vi.mocked(applyAdminConfiguration).mockResolvedValue({id:user});});
it('validates safe theme variables and preserves authoritative transaction errors',async()=>{
  expect((await themePost(request({name:' Theme ',css_overrides:':root { --accent: #ABC; }'}))).status).toBe(201);
  expect(applyAdminConfiguration).toHaveBeenCalledWith(expect.any(Request),user,'theme_create',{name:'Theme',css_overrides:':root{--accent:#abc;}'});
  expect((await themePost(request({name:'Unsafe',css_overrides:'body {display:none}'}))).status).toBe(422);
  vi.mocked(applyAdminConfiguration).mockRejectedValue(new ContentIntentError('Unavailable',404));
  expect((await themePatch(request({name:'Unknown',is_active:true}))).status).toBe(404);
});
it('uses the real seasonal fields and rejects obsolete fields and reversed dates',async()=>{
  const event={name:'Season',theme:'Reading',start_date:'2026-11-01T00:00:00Z',end_date:'2026-12-01T00:00:00Z',badge_name:null,is_published:false};
  expect((await seasonPost(request(event))).status).toBe(201);
  expect((await seasonPost(request({...event,end_date:event.start_date}))).status).toBe(422);
  expect((await seasonPost(request({...event,xp_multiplier:2}))).status).toBe(422);
});
it('validates storefront URLs and refuses non-admin changes before any mutation',async()=>{
  const store={name:'Shop',countries:['NG'],url_template:'https://shop.example.test/?isbn={isbn}&tag={tag}'};
  expect((await storePost(request(store))).status).toBe(201);
  for(const url of ['javascript:alert(1)','https://user:password@shop.example.test','https://shop.example.test/{unknown}'])expect((await storePost(request({...store,url_template:url}))).status).toBe(422);
  vi.mocked(applyAdminConfiguration).mockClear();vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({error:'Forbidden'},{status:403}));
  expect((await storePost(request(store))).status).toBe(403);expect(applyAdminConfiguration).not.toHaveBeenCalled();
});

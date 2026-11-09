import { expect, it,vi,beforeEach } from 'vitest';
import { clientUser, PUBLIC_USER_COLUMNS } from '@/lib/user-profile';
import {GET as authorProfile} from '@/app/api/author/[username]/route';

const author=vi.hoisted(()=>({rpc:vi.fn(),viewer:null as {id:string}|null,profile:{id:'writer',username:'private_writer',is_verified_author:true,bio:'Private biography'}}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:async()=>author.viewer}));
vi.mock('@/lib/arcs',()=>({getArcs:async()=>({arcs:[]})}));
vi.mock('@/lib/author-catalog',()=>({getAuthorCatalog:async()=>({books:[]})}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({rpc:author.rpc,from:()=>{const chain={select:()=>chain,eq:()=>chain,is:()=>chain,order:()=>chain,limit:()=>chain,maybeSingle:async()=>({data:author.profile}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:[],count:0}).then(resolve)};return chain;}})}));
beforeEach(()=>{author.rpc.mockReset();author.viewer=null;});

it('uses the shared database visibility rule before returning privileged author fields',async()=>{
 author.rpc.mockResolvedValue({data:false});const denied=await authorProfile(new Request('https://app.test/api/author/private_writer'),{params:Promise.resolve({username:'private_writer'})});expect(denied.status).toBe(404);expect(await denied.text()).not.toContain('Private biography');
 expect(author.rpc).toHaveBeenCalledWith('reading_author_visible',{p_user:null,p_author:'writer'});
 author.viewer={id:'follower'};author.rpc.mockResolvedValue({data:true});const allowed=await authorProfile(new Request('https://app.test/api/author/private_writer'),{params:Promise.resolve({username:'private_writer'})});expect(allowed.status).toBe(200);expect(await allowed.json()).toMatchObject({author:{bio:'Private biography'}});
 author.rpc.mockResolvedValue({error:{code:'XX000'}});expect((await authorProfile(new Request('https://app.test/api/author/private_writer'),{params:Promise.resolve({username:'private_writer'})})).status).toBe(503);
});

it('allowlists client profile responses and keeps new columns private', () => {
  expect(clientUser({ id: 'user', email: 'self@example.test', username: 'reader', pin_hash: 'hash', password_hash: 'hash', totp_secret: 'secret', recovery_codes: ['secret'], google_id: 'private', future_secret: 'private' }))
    .toEqual({ id: 'user', email: 'self@example.test', username: 'reader' });
  expect(clientUser(null)).toBeNull();
});

it('never requests private fields for public profiles', () => {
  const fields = PUBLIC_USER_COLUMNS.split(',');
  for (const field of ['email', 'pin_hash', 'password_hash', 'totp_secret', 'recovery_codes', 'google_id', 'telegram_id']) {
    expect(fields).not.toContain(field);
  }
});

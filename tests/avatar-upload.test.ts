import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import sharp from 'sharp';
import {POST} from '@/app/api/users/avatar/route';
import {cleanupAvatarUploads,storageDeadline} from '@/lib/profile-avatars';
import {createServiceClient} from '@/lib/supabase/server';
import {getStorageProvider} from '@/lib/storage/provider';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isDirectPostgres} from '@/lib/db/provider';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/storage/provider',()=>({getStorageProvider:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:vi.fn()}));
const user='00000000-0000-4000-8000-000000003801',uploadId='00000000-0000-4000-8000-000000003802',path='avatars/'+user+'/'+uploadId+'.webp';
const upload=vi.fn(),rpc=vi.fn(),profileUpdate=vi.fn(),remove=vi.fn();
const storage={upload,remove,getPublicUrl:(_:string,path:string)=>'https://cdn.test/'+path};
const request=(body:FormData|ReadableStream,headers:Record<string,string>={})=>new Request('https://app.test/api/users/avatar',{method:'POST',headers,body,...(body instanceof ReadableStream?{duplex:'half'}:{})} as RequestInit);
const form=(file:File|string)=>{const body=new FormData();body.set('file',file);return body;};
beforeEach(()=>{
  vi.clearAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:user,email:'avatar@example.test'});vi.mocked(isDirectPostgres).mockReturnValue(true);
  vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:true,remaining:4,resetAt:0});vi.mocked(getStorageProvider).mockReturnValue(storage);
  vi.mocked(createServiceClient).mockReturnValue({rpc,from:()=>({update:profileUpdate})} as never);profileUpdate.mockReturnValue({eq:async()=>({error:null})});
  upload.mockResolvedValue({data:{path},error:null});remove.mockResolvedValue({error:null});
  rpc.mockImplementation(async(name,args)=>({data:name==='begin_avatar_upload'?{id:uploadId,path,bucket:'avatars',state:'pending'}:true,error:null}));
});
it('rejects SVG, HTML, forged MIME and malformed file fields before touching storage',async()=>{
  for(const file of [new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],'avatar.svg',{type:'image/svg+xml'}),new File(['<html>payload</html>'],'avatar.jpg',{type:'image/jpeg'}),'not a file']){
    expect((await POST(request(form(file)))).status).toBe(typeof file==='string'?400:415);
  }
  expect(upload).not.toHaveBeenCalled();expect(profileUpdate).not.toHaveBeenCalled();
});
it('decodes and re-encodes the image, uses an immutable owned path and leaves the profile unchanged until commit',async()=>{
  const png=await sharp({create:{width:8,height:12,channels:4,background:'#336699'}}).png().toBuffer();
  const response=await POST(request(form(new File([new Uint8Array(png)],'misleading.svg',{type:'image/png'}))));expect(response.status).toBe(200);expect(await response.json()).toEqual({uploadId,publicUrl:'https://cdn.test/'+path});
  expect(upload).toHaveBeenCalledWith('avatars',path,expect.any(Buffer),{contentType:'image/webp',upsert:true});
  const output=await sharp(upload.mock.calls[0][2]).metadata();expect(output.format).toBe('webp');expect(output.exif).toBeUndefined();expect(output.width).toBeLessThanOrEqual(512);
  expect(profileUpdate).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledWith('finish_avatar_upload',{p_user_id:user,p_upload_id:uploadId,p_public_url:'https://cdn.test/'+path});
});
it('strips embedded metadata, applies orientation and bounds the decoded avatar dimensions',async()=>{
  const jpeg=await sharp({create:{width:1200,height:800,channels:3,background:'#884422'}}).jpeg().withMetadata({orientation:6}).toBuffer();expect((await sharp(jpeg).metadata()).exif).toBeDefined();
  expect((await POST(request(form(new File([new Uint8Array(jpeg)],'portrait.jpg',{type:'image/jpeg'}))))).status).toBe(200);
  const output=await sharp(upload.mock.calls[0][2]).metadata();expect(output.height).toBe(512);expect(output.width).toBeLessThan(output.height!);expect(output.exif).toBeUndefined();expect(output.orientation).toBeUndefined();
});
it('rejects declared MIME mismatches, truncated images and oversized chunked bodies without trusting content length',async()=>{
  const png=await sharp({create:{width:2,height:2,channels:3,background:'#336699'}}).png().toBuffer();
  expect((await POST(request(form(new File([new Uint8Array(png)],'avatar.jpg',{type:'image/jpeg'}))))).status).toBe(415);
  expect((await POST(request(form(new File([new Uint8Array([255,216,255])],'avatar.jpg',{type:'image/jpeg'}))))).status).toBe(415);
  const cancelled=vi.fn(),stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(3*1024*1024+65537));},cancel:cancelled});
  expect((await POST(request(stream,{'Content-Type':'multipart/form-data; boundary=fixture','Content-Length':'1'}))).status).toBe(413);expect(cancelled).toHaveBeenCalledOnce();expect(upload).not.toHaveBeenCalled();
});
it('requires a live owner and bounded account quota before reading or uploading images',async()=>{
  expect((await POST(request(form('invalid'),{'X-Liravo-Actor':'foreign'}))).status).toBe(409);expect(rpc).not.toHaveBeenCalled();
  vi.mocked(checkCriticalRateLimit).mockResolvedValueOnce({allowed:false,remaining:0,resetAt:0});expect((await POST(request(form('invalid')))).status).toBe(429);
  vi.mocked(getCurrentUser).mockResolvedValueOnce(null);expect((await POST(request(form('invalid')))).status).toBe(401);expect(upload).not.toHaveBeenCalled();
});
it('does not acknowledge a lost upload receipt and retries the same immutable object without touching the profile',async()=>{
  const png=await sharp({create:{width:4,height:4,channels:3,background:'#336699'}}).png().toBuffer();
  let failed=true;rpc.mockImplementation(async(name)=>name==='begin_avatar_upload'?{data:{id:uploadId,path,bucket:'avatars',state:'pending'},error:null}:{data:!failed,error:failed?{code:'08006'}:null});
  const body=()=>form(new File([new Uint8Array(png)],'photo.png',{type:'image/png'}));expect((await POST(request(body()))).status).toBe(503);failed=false;expect((await POST(request(body()))).status).toBe(200);
  expect(upload.mock.calls[0]).toEqual(upload.mock.calls[1]);expect(profileUpdate).not.toHaveBeenCalled();
});
it('reuses a stored uploaded receipt without another storage write',async()=>{
  const png=await sharp({create:{width:2,height:2,channels:3,background:'#336699'}}).png().toBuffer();
  rpc.mockResolvedValueOnce({data:{id:uploadId,path,bucket:'avatars',state:'uploaded',public_url:'https://cdn.test/'+path},error:null});
  expect((await POST(request(form(new File([new Uint8Array(png)],'photo.png',{type:'image/png'}))))).status).toBe(200);expect(upload).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledOnce();
});

it('acknowledges cleanup only after owned object deletion and a matching database receipt',async()=>{
  rpc.mockImplementation(async(name)=>({data:name==='claim_avatar_cleanup'?[{id:uploadId,claim_token:'lease',bucket:'avatars',path}]:true,error:null}));
  expect(await cleanupAvatarUploads()).toEqual({processed:1,failed:0,scanned:1});expect(remove).toHaveBeenCalledWith('avatars',[path]);
  remove.mockResolvedValueOnce({error:{message:'fixture unavailable'}});expect(await cleanupAvatarUploads()).toEqual({processed:0,failed:1,scanned:1});expect(rpc).toHaveBeenLastCalledWith('finish_avatar_cleanup',{p_id:uploadId,p_claim:'lease',p_success:false});
});
it('bounds ambiguous storage calls without waiting past the function budget',async()=>{
  vi.useFakeTimers();try{const pending=storageDeadline(new Promise(()=>{}));const check=expect(pending).rejects.toThrow('Storage deadline');await vi.advanceTimersByTimeAsync(6001);await check;}finally{vi.useRealTimers();}
});

it('rejects animated WebP and decoded pixel limits before a storage write',async()=>{
  const frames=Buffer.concat([Buffer.alloc(8*8*3,0),Buffer.alloc(8*8*3,255)]);
  const animated=await sharp(frames,{raw:{width:8,height:16,channels:3,pageHeight:8}}).webp({loop:0,delay:[100,100]}).toBuffer();
  expect((await sharp(animated).metadata()).pages).toBe(2);expect((await POST(request(form(new File([new Uint8Array(animated)],'animated.webp',{type:'image/webp'}))))).status).toBe(415);
  const large=await sharp({create:{width:5001,height:5000,channels:3,background:'#112233'}}).png({compressionLevel:1}).toBuffer();expect(large.byteLength).toBeLessThan(3*1024*1024);
  expect((await POST(request(form(new File([new Uint8Array(large)],'large.png',{type:'image/png'}))))).status).toBe(415);expect(upload).not.toHaveBeenCalled();
},10_000);

afterEach(()=>vi.unstubAllEnvs());
it('handles S3 partial deletion errors and validates CDN bases using the actual SDK transport',async()=>{
  let attempts=0,allowAcl=false;const methods:string[]=[],acls:(string|undefined)[]=[];
  const server=http.createServer((req,res)=>{methods.push(req.method!);req.resume();if(req.method==='PUT'){acls.push(req.headers['x-amz-acl'] as string|undefined);if(req.headers['x-amz-acl']&&!allowAcl){res.writeHead(400,{'Content-Type':'application/xml'});res.end('<Error><Code>AccessControlListNotSupported</Code><Message>ACLs disabled</Message></Error>');return;}res.writeHead(200,{ETag:'fixture'});res.end();return;}res.writeHead(200,{'Content-Type':'application/xml'});res.end(++attempts===1?'<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Error><Key>avatars/fixture.webp</Key><Code>AccessDenied</Code><Message>Fixture denial</Message></Error></DeleteResult>':'<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    vi.stubEnv('S3_ENDPOINT','http://127.0.0.1:'+String((server.address() as AddressInfo).port));vi.stubEnv('S3_REGION','us-east-1');vi.stubEnv('S3_KEY','isolated-key');vi.stubEnv('S3_SECRET','isolated-secret');vi.stubEnv('S3_CDN_URL','https://cdn.test/base');
    const actual=await vi.importActual<typeof import('@/lib/storage/provider')>('@/lib/storage/provider'),adapter=actual.getStorageProvider();
    expect((await adapter.remove('avatars',['avatars/fixture.webp'])).error).not.toBeNull();expect((await adapter.remove('avatars',['avatars/fixture.webp'])).error).toBeNull();expect(methods).toEqual(['POST','POST']);
    vi.stubEnv('S3_OBJECT_ACL','none');expect((await adapter.upload('avatars','avatars/fixture.webp',Buffer.from('fixture'),{contentType:'image/webp'})).error).toBeNull();expect(acls).toEqual([undefined]);
    allowAcl=true;vi.stubEnv('S3_OBJECT_ACL','public-read');expect((await adapter.upload('avatars','avatars/fixture.webp',Buffer.from('fixture'),{contentType:'image/webp'})).error).toBeNull();expect(acls[1]).toBe('public-read');
    vi.stubEnv('S3_OBJECT_ACL','public-read-write');expect((await adapter.upload('avatars','avatars/fixture.webp',Buffer.from('fixture'))).error).not.toBeNull();expect(acls).toHaveLength(2);
    expect(adapter.getPublicUrl('avatars','avatars/fixture.webp')).toBe('https://cdn.test/base/avatars/fixture.webp');
    for(const base of ['https://user:secret@cdn.test','https://cdn.test/base?x=1','javascript:alert(1)']){vi.stubEnv('S3_CDN_URL',base);expect(()=>adapter.getPublicUrl('avatars','avatars/fixture.webp')).toThrow();}
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

import {ECDH} from 'node:crypto';
import {lookup} from 'node:dns';
import {Agent} from 'node:https';
import {BlockList,isIP} from 'node:net';
import {currentFactorSessionHash} from '@/lib/auth/second-factor';
import {createServiceClient} from '@/lib/supabase/server';

export class PushSubscriptionError extends Error{constructor(public status:number){super('Push registration unavailable');}}
const blocked4=new BlockList(),blocked6=new BlockList(),global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
for(const [address,prefix]of[['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]as const)blocked4.addSubnet(address,prefix,'ipv4');
for(const [address,prefix]of[['::',96],['::ffff:0:0',96],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32],['2002::',16],['2001::',32],['2001:10::',28],['2001:20::',28],['2001:2::',48]]as const)blocked6.addSubnet(address,prefix,'ipv6');
export const publicPushAddress=(address:string)=>{const family=isIP(address);return !!family&&(family!==6||global6.check(address,'ipv6'))&&!(family===4?blocked4:blocked6).check(address,family===4?'ipv4':'ipv6');};
export function trustedPushEndpoint(value:string){
 try{const url=new URL(value);return value.length<=2048&&url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&(!url.port||url.port==='443')
  &&(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname));}catch{return false;}
}
export function validPushKeys(p256dh:string,auth:string){
 try{if(!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh)||!/^[A-Za-z0-9_-]+={0,2}$/.test(auth))return false;const point=Buffer.from(p256dh,'base64url');if(point.length!==65||point[0]!==4||Buffer.from(auth,'base64url').length!==16)return false;ECDH.convertKey(point,'prime256v1');return true;}catch{return false;}
}
export const pushAgent=new Agent({lookup:(hostname,options,callback)=>{
 if(!trustedPushEndpoint('https://'+hostname)){callback(new Error('Unsupported push host'),'',4);return;}
 lookup(hostname,{...options,all:true},(error,addresses)=>{
  if(error||!addresses.length||addresses.some(item=>!publicPushAddress(item.address))){callback(error??new Error('Unsafe push address'),'',4);return;}
  if(options.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);
 });
}});
export async function registerPush(userId:string,channel:'web'|'expo',endpoint:string,keys?:{p256dh:string;auth:string},platform?:string){
 const session=await currentFactorSessionHash(userId);
 const {data,error}=await createServiceClient().rpc('register_push_subscription' as never,{p_user:userId,p_session:session,p_channel:channel,p_endpoint:endpoint,p_p256dh:keys?.p256dh??null,p_auth:keys?.auth??null,p_platform:platform??'web'} as never);
 if(error||typeof data!=='string'||! /^[a-f0-9-]{36}$/i.test(data))throw new PushSubscriptionError(error?.code==='P1003'?403:error?.code==='P1004'?409:503);
}
export async function revokePushSession(session:string,knownSession=false){
 const {error}=await createServiceClient().rpc('revoke_push_session' as never,{p_session:session,p_known:knownSession} as never);if(error)throw new Error('Push revocation unavailable');
}
export async function unregisterPush(userId:string,endpoint?:string){
 const session=await currentFactorSessionHash(userId);
 const {error}=await createServiceClient().rpc('unregister_push_subscription' as never,{p_user:userId,p_session:session,p_endpoint:endpoint??null} as never);if(error)throw new Error('Push revocation unavailable');
}

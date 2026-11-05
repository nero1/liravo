import {createTranslator} from 'next-intl';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';
import {notificationText} from '@/lib/notification-message';
import {NOTIFICATION_KEYS,notificationPreference} from '@/lib/notification-preferences';
import { createServiceClient } from '@/lib/supabase/server';
import {pushAgent,trustedPushEndpoint,validPushKeys} from '@/lib/push-subscriptions';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  recipientId?:string;
  notificationType?:string;
  entityType?:string;
  messageKey?:string|null;
  messageValues?:Record<string,unknown>|null;
}

interface PushSubscription {id:string;channel:'web'|'expo';endpoint:string;p256dh:string|null;auth:string|null;session_hash:string;}
type Delivery='sent'|'gone'|'retry';
async function deliver(sub:PushSubscription,payload:PushPayload):Promise<Delivery>{
 if(sub.channel==='web'){
  if(!trustedPushEndpoint(sub.endpoint)||!sub.p256dh||!sub.auth||!validPushKeys(sub.p256dh,sub.auth))return 'gone';
  const publicKey=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY;
  if(!publicKey||!privateKey)return 'retry';
  try{
   const webpush=await import('web-push');
   await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify(payload),{vapidDetails:{subject:process.env.VAPID_SUBJECT??'mailto:hello@liravo.org',publicKey,privateKey},agent:pushAgent,timeout:6000,TTL:3600});
   return 'sent';
  }catch(error){return [404,410].includes(Number((error as {statusCode?:number}).statusCode))?'gone':'retry';}
 }
 try{
  const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({to:sub.endpoint,title:payload.title,body:payload.body,data:{url:payload.url??'/notifications',eventId:payload.tag,recipientId:payload.recipientId}}),signal:AbortSignal.timeout(6000)});
  if(!response.ok)return 'retry';
  const result=await response.json();return result?.data?.status==='ok'?'sent':result?.data?.details?.error==='DeviceNotRegistered'?'gone':'retry';
 }catch{return 'retry';}
}
export async function sendPushToUser(userId: string, payload: PushPayload,receipt?:{delivered:string[];ack:(id:string)=>Promise<void>}): Promise<void> {
  const supabase = createServiceClient();

  const [webSubsResult, userResult] = await Promise.all([
    supabase.from('push_subscriptions').select('id,channel,endpoint,p256dh,auth,session_hash').eq('user_id', userId).gt('expires_at',new Date().toISOString()).limit(10),
    supabase.from('users').select('preferred_locale,is_banned,deleted_at,'+NOTIFICATION_KEYS.join(',')).eq('id', userId).single(),
  ]);

  const user=userResult.data as Record<string,unknown>|null;
  if(userResult.error||webSubsResult.error)throw new Error('Push state unavailable');
  if(!user||user.is_banned||user.deleted_at)return;
  const preference=payload.notificationType?notificationPreference(payload.notificationType,payload.entityType):null;
  if(preference&&user[preference]===false)return;
  const locale=user.preferred_locale==='fr'||user.preferred_locale==='de'?user.preferred_locale:'en';
  const t=createTranslator({locale,messages:({en,fr,de})[locale]});
  const category=payload.notificationType==='follow'?'follow':payload.notificationType==='tip'?'tip':payload.notificationType==='badge_earned'?'badge':'activity';
  const localized={title:payload.notificationType?t(`notificationMessages.titles.${category}`):payload.title,
    body:payload.messageKey?notificationText({type:payload.notificationType??'',message:payload.body,message_key:payload.messageKey,message_values:payload.messageValues},t,key=>t.has(key),locale):payload.body,
    url:payload.url,tag:payload.tag,recipientId:userId};
  const delivered=new Set(receipt?.delivered??[]);
  const outcomes=await Promise.allSettled(((webSubsResult.data??[])as PushSubscription[]).filter(sub=>!delivered.has(sub.id)).map(async sub=>{
    const outcome=await deliver(sub,localized);
    if(outcome==='retry')throw new Error('Push delivery unavailable');
    if(outcome==='gone'){
      const {error}=await supabase.from('push_subscriptions').delete().eq('id',sub.id).eq('user_id',userId).eq('session_hash',sub.session_hash);
      if(error)throw new Error('Push cleanup unavailable');
    }else await receipt?.ack(sub.id);
  }));
  if(outcomes.some(result=>result.status==='rejected'))throw new Error('Push delivery unavailable');
}

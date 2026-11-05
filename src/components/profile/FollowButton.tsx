'use client';
import {useState,useRef,useEffect} from 'react';
import {useTranslations} from 'next-intl';
import {cn} from '@/lib/utils';
import {useRequestIntent} from '@/lib/client/useRequestIntent';
import {validFollowReceipt,recoverFollowReceipt} from '@/lib/client/follow-receipt';
interface Props{targetUserId:string;currentUserId:string;initialFollowing:boolean;}
export function FollowButton(props:Props){return props.targetUserId===props.currentUserId?null:<OwnedFollowButton key={props.currentUserId+props.targetUserId} {...props}/>;}
function OwnedFollowButton({targetUserId,currentUserId,initialFollowing}:Props){
 const t=useTranslations('onboarding'),common=useTranslations('common'),intent=useRequestIntent(currentUserId),busy=useRef(false),alive=useRef(true),[following,setFollowing]=useState(initialFollowing),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),scope='follow:'+targetUserId;
 useEffect(()=>{setFollowing(initialFollowing);},[initialFollowing]);
 useEffect(()=>{alive.current=true;const controller=new AbortController();void(async()=>{try{const pending=await intent.pending(scope);if(pending){setLoading(true);const receipt=await recoverFollowReceipt(currentUserId,targetUserId,pending['Idempotency-Key'],controller.signal);if(receipt&&!controller.signal.aborted){setFollowing(receipt.following);intent.complete(scope,receipt.requestKey);}}}catch{if(!controller.signal.aborted)setFailed(true);}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>{alive.current=false;controller.abort();};},[currentUserId,targetUserId]); // eslint-disable-line react-hooks/exhaustive-deps
 async function toggle(){if(busy.current)return;busy.current=true;setLoading(true);setFailed(false);const desired=!following;
  try{const headers=await intent.durableHeaders({targetId:targetUserId,following:desired},scope);if(!alive.current)return;let response:Response|null=null;try{response=await fetch('/api/users/'+targetUserId+'/follow',{method:desired?'POST':'DELETE',headers});}catch{}let receipt;if(response?.ok){try{receipt=await response.json();}catch{}if(receipt!==undefined&&(!validFollowReceipt(receipt,currentUserId,targetUserId,headers['Idempotency-Key'])||receipt.committedFollowing!==desired))throw Error();}else if(response&&response.status<500)throw Error();if(!receipt)receipt=await recoverFollowReceipt(currentUserId,targetUserId,headers['Idempotency-Key']);if(!receipt)throw Error();if(alive.current){setFollowing(receipt.following);intent.complete(scope,receipt.requestKey);}}
  catch{if(alive.current)setFailed(true);}finally{busy.current=false;if(alive.current)setLoading(false);}
 }
 return <div className="space-y-2"><button type="button" onClick={()=>void toggle()} disabled={loading} aria-pressed={following} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',following?'bg-muted text-foreground border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-950/20':'bg-amber-500 text-white hover:bg-amber-600')}>{loading?common('loading'):t(following?'following':'follow')}</button>{failed&&<p role="alert" className="text-sm text-destructive">{t('followFailed')}</p>}</div>;
}

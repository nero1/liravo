import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {Button} from '@/components/ui/Button';
import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useTranslations} from '@/hooks/useTranslations';
import {validFollowReceipt,type FollowReceipt} from '../../../src/lib/client/follow-receipt';
interface Props{userId:string;isFollowing:boolean;}
export function FollowButton(props:Props){const owner=useAuthStore(state=>state.user?.id);return owner&&owner!==props.userId?<OwnedFollowButton key={owner+props.userId} {...props} owner={owner}/>:null;}
export function OwnedFollowButton({userId,isFollowing,owner}:Props&{owner:string}){
 const qc=useQueryClient(),{t}=useTranslations('onboarding'),intent=useRequestIntent(owner),scope='follow.'+userId,alive=useRef(true),[following,setFollowing]=useState(isFollowing),[recovering,setRecovering]=useState(true),[failed,setFailed]=useState(false);
 function invalidate(){if(useAuthStore.getState().user?.id!==owner)return;for(const key of['user','author','discover','feed'])void qc.invalidateQueries({queryKey:[key]});void api.get<{user:import('@/types').UserRow}>(ENDPOINTS.users.me).then(({user})=>{if(user.id===owner&&useAuthStore.getState().user?.id===owner)useAuthStore.getState().setUser(user);}).catch(()=>{});}
 async function confirm(receipt:unknown,key:string){if(!validFollowReceipt(receipt,owner,userId,key)||useAuthStore.getState().user?.id!==owner)throw Error('Invalid follow receipt');await intent.complete(scope,key);return receipt;}
 async function recover(key:string,signal?:AbortSignal){const receipt=await api.get<unknown>(ENDPOINTS.users.follow(userId),{receipt:key},signal);return confirm(receipt,key);}
 useEffect(()=>setFollowing(isFollowing),[isFollowing]);
 useEffect(()=>{alive.current=true;const controller=new AbortController();void(async()=>{try{const pending=await intent.pending(scope);if(pending){const receipt=await recover(pending['Idempotency-Key'],controller.signal);if(!controller.signal.aborted){setFollowing(receipt.following);invalidate();}}}catch(error){if(!controller.signal.aborted&&(error as{status?:number}).status!==404)setFailed(true);}finally{if(!controller.signal.aborted)setRecovering(false);}})();return()=>{alive.current=false;controller.abort();};},[owner,userId]); // eslint-disable-line react-hooks/exhaustive-deps
 const toggle=useMutation({mutationFn:async(desired:boolean)=>{const headers=await intent.durableHeaders({targetId:userId,following:desired},scope);if(useAuthStore.getState().user?.id!==owner)throw Error('Account changed');let receipt:FollowReceipt;
  try{const result=desired?await api.post<unknown>(ENDPOINTS.users.follow(userId),undefined,headers):await api.delete<unknown>(ENDPOINTS.users.follow(userId),headers);if(!validFollowReceipt(result,owner,userId,headers['Idempotency-Key'])||result.committedFollowing!==desired)throw Error('Invalid follow receipt');receipt=await confirm(result,headers['Idempotency-Key']);}
  catch(error){if((error as{status?:number}).status&&((error as{status:number}).status<500))throw error;receipt=await recover(headers['Idempotency-Key']);}return receipt;
 },onSuccess:receipt=>{if(alive.current&&useAuthStore.getState().user?.id===owner){setFollowing(receipt.following);setFailed(false);invalidate();}},onError:()=>{if(alive.current&&useAuthStore.getState().user?.id===owner)setFailed(true);}});
 return <View><Button onPress={()=>toggle.mutate(!following)} variant={following?'outline':'primary'} size="sm" loading={toggle.isPending||recovering} accessibilityLabel={t(following?'following':'follow')} accessibilityState={{selected:following}}>{t(following?'following':'follow')}</Button>{failed&&<Text accessibilityLiveRegion="polite" className="text-destructive text-sm">{t('followFailed')}</Text>}</View>;
}

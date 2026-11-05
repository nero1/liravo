import {Alert} from 'react-native';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {api,ApiError} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useTranslations} from '@/hooks/useTranslations';

export function useAdminChange<T>({path,catalog,scope,validate}:{path:string;catalog:string;scope:(body:T)=>string|Promise<string>;validate:(result:any,body:T)=>boolean}){
  const owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),qc=useQueryClient(),{t}=useTranslations('nativeAdmin'),common=useTranslations('common');
  return useMutation({mutationFn:async(body:T)=>{
    const action=await scope(body),headers=await intent.durableHeaders(body,action);if(useAuthStore.getState().user?.id!==owner)throw new Error('Account changed');
    const result=await api.patch<{actorId:string}>(path,body,headers);
    if(result.actorId!==owner||useAuthStore.getState().user?.id!==owner||!validate(result,body))throw new Error('Invalid admin receipt');await intent.complete(action,headers['Idempotency-Key']);return result;
  },onSuccess:()=>{if(useAuthStore.getState().user?.id===owner)void qc.invalidateQueries({queryKey:catalog==='flags'?['admin',owner,'feature-flags']:['admin-catalog',owner,catalog]});},onError:error=>{if(useAuthStore.getState().user?.id===owner)Alert.alert(common.t('error'),t(error instanceof ApiError&&error.code==='P1006'?'signInRequired':'updateFailed'));}});
}

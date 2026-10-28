import {useRef,useState} from 'react';
import {View,Text} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {useAuthStore} from '@/stores/auth';
import {useShelves} from '@/hooks/useShelf';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useTranslations} from '@/hooks/useTranslations';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {Button} from '@/components/ui/Button';

export function ReviewWantToReadButton({bookId,reviewId}:{bookId:string;reviewId:string}){
  const {t}=useTranslations('books'),common=useTranslations('common'),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),qc=useQueryClient(),busy=useRef(false);
  const {data,isLoading,error,refetch}=useShelves(bookId),[pending,setPending]=useState(false),[failed,setFailed]=useState(false);
  const shelf=data?.shelves.find(value=>value.default_type==='want_to_read'),selected=!!shelf&&!!data?.addedToShelves.includes(shelf.id);
  async function add(){
    if(!owner||busy.current)return;busy.current=true;setPending(true);setFailed(false);
    try{
      const body={reviewId,active:true},scope='review.'+bookId;
      const result=await api.post<{reacted:boolean}>(ENDPOINTS.books.reactions(bookId),body,await intent.durableHeaders(body,scope));
      if(result.reacted!==true)throw new Error('Invalid reaction');await intent.complete(scope);
      if(useAuthStore.getState().user?.id===owner){await qc.invalidateQueries({queryKey:['shelves',bookId]});void qc.invalidateQueries({queryKey:['creator']});void qc.invalidateQueries({queryKey:['book',bookId]});}
    }catch{if(useAuthStore.getState().user?.id===owner)setFailed(true);}finally{busy.current=false;setPending(false);}
  }
  return <View className="gap-2"><Button size="sm" variant="outline" loading={pending} disabled={selected||isLoading||!!error} accessibilityLabel={t('reviewWantToRead')} accessibilityState={{selected}} onPress={()=>void add()}>{t('wantToRead')}</Button>{(failed||error)&&<><Text accessibilityLiveRegion="polite" className="text-destructive">{common.t('error')}</Text>{error&&<Button size="sm" variant="ghost" onPress={()=>void refetch()}>{common.t('retry')}</Button>}</>}</View>;
}

import {useState} from 'react';
import {Text,ScrollView,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useMutation} from '@tanstack/react-query';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {api} from '@/lib/api';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import {validProofUrl} from '../../../src/lib/content-form-values';
export default function VerifyAuthorScreen(){const owner=useAuthStore(state=>state.user?.id);return <NativeVerificationForm key={owner} owner={owner}/>;}
export function NativeVerificationForm({owner}:{owner:string|undefined}){
  const {t}=useTranslations('authorVerification'),{t:common}=useTranslations('common'),intent=useRequestIntent(owner),[penName,setPenName]=useState(''),[publisher,setPublisher]=useState(''),[titles,setTitles]=useState(''),[website,setWebsite]=useState(''),[proof,setProof]=useState(''),[saved,setSaved]=useState(false),linksValid=validProofUrl(website)&&validProofUrl(proof);
  const submit=useMutation({mutationFn:async()=>{const body={pen_name:penName.trim(),publisher:publisher.trim(),book_titles:titles.trim(),website_url:website.trim(),social_proof_url:proof.trim()},data=await api.post<{actorId:string;request:{id:string;user_id:string}}>('/api/author/verification-request',body,await intent.durableHeaders(body,'author.verification'));if(data.actorId!==owner||!data.request?.id||data.request.user_id!==owner)throw Error('Invalid verification receipt');await intent.complete('author.verification');},onSuccess:()=>{if(useAuthStore.getState().user?.id===owner)setSaved(true);},onError:()=>Alert.alert(common('error'),t('failed'))});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t(saved?'submittedTitle':'title')}</Text>{saved?<Text className="text-foreground">{t('submitted')}</Text>:<><Text className="text-sm text-muted-foreground">{t('description')}</Text><Input label={t('penName')} placeholder={t('penNamePlaceholder')} value={penName} onChangeText={setPenName} editable={!submit.isPending} maxLength={100}/><Input label={t('publisher')} value={publisher} onChangeText={setPublisher} editable={!submit.isPending} maxLength={200}/><Input label={t('bookTitles')} placeholder={t('bookTitlesPlaceholder')} value={titles} onChangeText={setTitles} editable={!submit.isPending} multiline maxLength={2000}/><Input label={t('website')} placeholder={t('urlPlaceholder')} value={website} onChangeText={setWebsite} editable={!submit.isPending} autoCapitalize="none" keyboardType="url" error={!validProofUrl(website)?t('invalidLink'):undefined}/><Input label={t('socialProof')} placeholder={t('urlPlaceholder')} value={proof} onChangeText={setProof} editable={!submit.isPending} autoCapitalize="none" keyboardType="url" error={!validProofUrl(proof)?t('invalidLink'):undefined}/><Button onPress={()=>submit.mutate()} loading={submit.isPending} disabled={!owner||!penName.trim()||!titles.trim()||!linksValid}>{t('submit')}</Button></>}</ScrollView></SafeAreaView>;
}

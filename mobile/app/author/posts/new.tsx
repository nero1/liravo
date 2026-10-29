import {Alert,ScrollView,KeyboardAvoidingView,Platform} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useState} from 'react';
import {useRouter} from 'expo-router';
import {useMutation} from '@tanstack/react-query';
import {useTranslations} from '@/hooks/useTranslations';
import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
export default function NewAuthorPostScreen(){
  const router=useRouter(),{t}=useTranslations('authorCatalog'),{t:common}=useTranslations('common'),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),[title,setTitle]=useState(''),[content,setContent]=useState('');
  const create=useMutation({mutationFn:async()=>{const body={title:title.trim(),body:content.trim(),type:'announcement'},result=await api.post<{post:{id:string;author_id:string}}>(ENDPOINTS.author.createPost,body,await intent.durableHeaders(body,'author.post'));if(!result.post?.id||result.post.author_id!==owner)throw Error('Invalid author post receipt');await intent.complete('author.post');},onSuccess:()=>{if(useAuthStore.getState().user?.id===owner)router.back();},onError:()=>Alert.alert(common('error'),t('saveFailed'))});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><KeyboardAvoidingView className="flex-1" behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
    <Input editable={!create.isPending} label={t('title')} value={title} onChangeText={setTitle} maxLength={200}/><Input editable={!create.isPending} label={t('content')} value={content} onChangeText={setContent} multiline numberOfLines={8} maxLength={2000} style={{minHeight:160,textAlignVertical:'top'}}/>
    <Button onPress={()=>create.mutate()} loading={create.isPending} disabled={!title.trim()||!content.trim()} size="lg">{t('publishPost')}</Button>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

import {Alert,ScrollView,View,Text,Switch} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useState} from 'react';
import {useRouter} from 'expo-router';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useTranslations} from '@/hooks/useTranslations';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import type {ListRow} from '@/types';
export default function NewListScreen(){const owner=useAuthStore(state=>state.user?.id);return <NativeListForm key={owner} owner={owner}/>;}
export function NativeListForm({owner}:{owner:string|undefined}){
  const {t}=useTranslations('readingLists'),{t:common}=useTranslations('common'),intent=useRequestIntent(owner),router=useRouter(),qc=useQueryClient(),[name,setName]=useState(''),[description,setDescription]=useState(''),[isPublic,setIsPublic]=useState(true);
  const create=useMutation({mutationFn:async()=>{const body={name:name.trim(),description:description.trim(),is_public:isPublic},data=await api.post<{list:ListRow;actorId:string}>('/api/lists',body,await intent.durableHeaders(body,'list.create'));if(data.actorId!==owner||data.list?.user_id!==owner||!data.list.id)throw Error('Invalid list receipt');await intent.complete('list.create');return data.list;},onSuccess:list=>{if(useAuthStore.getState().user?.id!==owner)return;void qc.invalidateQueries({queryKey:['lists']});router.replace('/lists/'+list.id);},onError:()=>Alert.alert(common('error'),t('saveFailed'))});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Input label={t('name')} value={name} onChangeText={setName} placeholder={t('nameExample')} maxLength={100} editable={!create.isPending}/><Input label={t('details')} value={description} onChangeText={setDescription} multiline numberOfLines={3} maxLength={500} editable={!create.isPending}/><View className="flex-row items-center justify-between"><Text className="text-foreground">{t('public')}</Text><Switch accessibilityLabel={t('public')} value={isPublic} onValueChange={setIsPublic} disabled={create.isPending}/></View><Button loading={create.isPending} disabled={!owner||!name.trim()} onPress={()=>create.mutate()}>{t('create')}</Button></ScrollView></SafeAreaView>;
}

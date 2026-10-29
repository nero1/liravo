import {Alert,ScrollView} from 'react-native';
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
import {BookPicker,type SelectedBook} from '@/components/books/BookPicker';
export default function NewBuddyReadScreen(){
  const router=useRouter(),qc=useQueryClient(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),{t}=useTranslations('buddyReads'),{t:common}=useTranslations('common'),[title,setTitle]=useState(''),[book,setBook]=useState<SelectedBook|null>(null),[capacity,setCapacity]=useState('3'),[chapter,setChapter]=useState('1'),maximum=Number(capacity),start=Number(chapter),valid=!!owner&&!!book&&!!title.trim()&&Number.isInteger(maximum)&&maximum>=2&&maximum<=5&&Number.isInteger(start)&&start>=1&&start<=100000;
  const create=useMutation({mutationFn:async()=>{if(!valid)throw Error();const body={title:title.trim(),book_id:book!.id,max_participants:maximum,current_chapter:start},data=await api.post<{actorId:string;buddyRead:{id:string;created_by:string}}>('/api/buddy-reads',body,await intent.durableHeaders(body,'buddy.create'));if(data.actorId!==owner||data.buddyRead?.created_by!==owner||!data.buddyRead.id)throw Error('Invalid buddy receipt');await intent.complete('buddy.create');return data.buddyRead;},onSuccess:read=>{if(useAuthStore.getState().user?.id!==owner)return;void qc.invalidateQueries({queryKey:['buddy-reads']});router.replace('/buddy-reads/'+read.id);},onError:()=>Alert.alert(common('error'),t('saveFailed'))});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Input label={t('name')} value={title} onChangeText={setTitle} maxLength={120} editable={!create.isPending}/><BookPicker value={book} onChange={setBook} disabled={create.isPending}/><Input label={t('capacity')} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" maxLength={1} editable={!create.isPending}/><Input label={t('startingChapter')} value={chapter} onChangeText={setChapter} keyboardType="number-pad" maxLength={6} editable={!create.isPending}/><Button onPress={()=>create.mutate()} loading={create.isPending} disabled={!valid}>{t('create')}</Button></ScrollView></SafeAreaView>;
}

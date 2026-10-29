import {useTranslations} from '@/hooks/useTranslations';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useAuthStore} from '@/stores/auth';
import {View,Text,Alert,ScrollView,Switch} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useState} from 'react';
import {useRouter} from 'expo-router';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import {BookPicker,type SelectedBook} from '@/components/books/BookPicker';
export default function NewReadingRoomScreen(){
  const {t}=useTranslations('readingRooms'),{t:common}=useTranslations('common'),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),router=useRouter(),qc=useQueryClient(),[name,setName]=useState(''),[book,setBook]=useState<SelectedBook|null>(null),[isPublic,setIsPublic]=useState(true);
  const create=useMutation({mutationFn:async()=>{const body={name:name.trim(),...(book?{book_id:book.id}:{}),is_public:isPublic},data=await api.post<{actorId:string;room:{id:string;created_by:string}}>('/api/reading-rooms',body,await intent.durableHeaders(body,'reading-room.create'));if(data.actorId!==owner||data.room?.created_by!==owner||!data.room.id)throw Error('Invalid room receipt');await intent.complete('reading-room.create');return data.room;},onSuccess:room=>{if(useAuthStore.getState().user?.id!==owner)return;void qc.invalidateQueries({queryKey:['reading-rooms']});router.replace('/reading-rooms/'+room.id);},onError:()=>Alert.alert(common('error'),t('saveFailed'))});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Input label={t('name')} value={name} onChangeText={setName} maxLength={100} editable={!create.isPending}/><BookPicker value={book} onChange={setBook} disabled={create.isPending} label={t('optionalBook')}/><Text className="text-sm text-muted-foreground">{t('optionalBookHelp')}</Text><View className="flex-row items-center justify-between gap-3"><Text className="text-foreground">{t('publicRoom')}</Text><Switch accessibilityLabel={t('publicRoom')} value={isPublic} onValueChange={setIsPublic} disabled={create.isPending}/></View><Text className="text-sm text-muted-foreground">{t('publicHelp')}</Text><Button onPress={()=>create.mutate()} loading={create.isPending} disabled={!owner||!name.trim()}>{t('create')}</Button></ScrollView></SafeAreaView>;
}

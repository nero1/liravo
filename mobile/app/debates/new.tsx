import {useEffect,useRef,useState} from 'react';
import {View,Text,ScrollView,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter,useLocalSearchParams} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useTranslations} from '@/hooks/useTranslations';
import {useBook} from '@/hooks/useBooks';
import {BookPicker,type SelectedBook} from '@/components/books/BookPicker';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import {QueryError} from '@/components/ui/EmptyState';
export default function NewDebateScreen(){const {bookId}=useLocalSearchParams<{bookId?:string}>(),owner=useAuthStore(state=>state.user?.id),book=useBook(bookId??''),{t:common}=useTranslations('common');if(bookId&&book.isLoading)return <Text>{common('loading')}</Text>;if(bookId&&(book.isError||!book.data?.book))return <QueryError error={book.error} retry={()=>void book.refetch()}/>;return <NativeDebateForm key={owner+':'+(bookId??'new')} owner={owner} initialBook={book.data?.book??null}/>;}
export function NativeDebateForm({owner,initialBook=null}:{owner:string|undefined;initialBook?:SelectedBook|null}){
  const {t}=useTranslations('bookDebates'),{t:common}=useTranslations('common'),intent=useRequestIntent(owner),router=useRouter(),qc=useQueryClient(),[book,setBook]=useState<SelectedBook|null>(initialBook),[question,setQuestion]=useState(''),[saving,setSaving]=useState(false),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function create(){if(saving||!owner||!book||question.trim().length<5)return;setSaving(true);const body={book_id:book.id,question:question.trim()};try{const data=await api.post<{actorId:string;debate:{id:string;user_id:string;book_id:string}}>('/api/debates',body,await intent.durableHeaders(body,'debate.create'));if(data.actorId!==owner||data.debate?.user_id!==owner||data.debate.book_id!==book.id||!data.debate.id)throw Error('Invalid debate receipt');await intent.complete('debate.create');if(alive.current&&useAuthStore.getState().user?.id===owner){void qc.invalidateQueries({queryKey:['debates']});router.replace('/debates/'+data.debate.id);}}catch{Alert.alert(common('error'),t('createFailed'));}finally{setSaving(false);}}
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t('create')}</Text><BookPicker value={book} onChange={setBook} disabled={saving}/><Input label={t('question')} value={question} onChangeText={setQuestion} placeholder={t('questionPlaceholder')} maxLength={200} editable={!saving} multiline/><View className="gap-2"><Text className="text-xs text-muted-foreground">{t('questionHelp')}</Text><Text className="text-sm text-muted-foreground">{t('visibilityHelp')}</Text></View><Button onPress={()=>void create()} loading={saving} disabled={!owner||!book||question.trim().length<5}>{t('create')}</Button></ScrollView></SafeAreaView>;
}

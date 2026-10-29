import {useState} from 'react';
import {View,Text,ScrollView,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {useAuthStore} from '@/stores/auth';
import {useTranslations} from '@/hooks/useTranslations';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useBook} from '@/hooks/useBooks';
import {api} from '@/lib/api';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import {QueryError} from '@/components/ui/EmptyState';
import {LoadingSpinner} from '@/components/ui/LoadingSpinner';
import {SelectedEdition} from '@/components/books/SelectedEdition';
import type {QuoteRow} from '@/types';
import {quotePageNumber} from '../../../src/lib/content-form-values';
export default function NewQuoteScreen(){const {bookId}=useLocalSearchParams<{bookId?:string}>(),owner=useAuthStore(state=>state.user?.id);return <NativeQuoteForm key={owner+':'+bookId} bookId={typeof bookId==='string'?bookId:''} owner={owner}/>;}
export function NativeQuoteForm({bookId,owner}:{bookId:string;owner:string|undefined}){
  const {t}=useTranslations('books'),{t:contentText}=useTranslations('nativeContent'),{t:common}=useTranslations('common'),router=useRouter(),qc=useQueryClient(),intent=useRequestIntent(owner),query=useBook(bookId),book=query.data?.book,[content,setContent]=useState(''),[page,setPage]=useState(''),pageNumber=quotePageNumber(page);
  const submit=useMutation({mutationFn:async()=>{if(!book||!owner||pageNumber===null)throw Error('Invalid quote');const payload={book_id:book.id,content:content.trim(),...(pageNumber!==undefined?{page_number:pageNumber}:{})},scope='quote.'+book.id,data=await api.post<{quote:QuoteRow}>('/api/quotes',payload,await intent.durableHeaders(payload,scope));if(!data.quote?.id||data.quote.user_id!==owner||data.quote.book_id!==book.id)throw Error('Invalid quote receipt');await intent.complete(scope);return data;},onSuccess:()=>{if(useAuthStore.getState().user?.id!==owner)return;void qc.invalidateQueries({queryKey:['book',bookId,'quotes']});void qc.invalidateQueries({queryKey:['quotes']});void qc.invalidateQueries({queryKey:['stats']});router.back();},onError:()=>Alert.alert(common('error'),t('quoteFailed'))});
  if(!bookId)return <View className="p-4 gap-3"><Text className="text-foreground">{contentText('bookRequired')}</Text><Button onPress={()=>router.push('/(tabs)/discover')}>{contentText('discover')}</Button></View>;
  if(query.error)return <QueryError error={query.error} retry={()=>void query.refetch()}/>;if(!book)return <LoadingSpinner/>;
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}><SelectedEdition book={book}/><Input label={t('quoteText')} value={content} onChangeText={setContent} placeholder={t('quotePlaceholder')} editable={!submit.isPending} multiline numberOfLines={6} maxLength={1000} style={{minHeight:140,textAlignVertical:'top'}}/><Input label={t('quotePage')} value={page} onChangeText={setPage} placeholder={contentText('pageExample')} editable={!submit.isPending} keyboardType="number-pad" maxLength={10} error={pageNumber===null?t('quoteInvalidPage'):undefined}/><Button onPress={()=>submit.mutate()} loading={submit.isPending} disabled={!owner||!content.trim()||pageNumber===null}>{t('saveQuote')}</Button></ScrollView></SafeAreaView>;
}

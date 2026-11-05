import {useTranslations} from '@/hooks/useTranslations';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useAuthStore} from '@/stores/auth';
import {View,Text,TouchableOpacity,Alert,ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useState} from 'react';
import {useRouter} from 'expo-router';
import {useMutation,useInfiniteQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {ENDPOINTS} from '@/constants/api';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
export default function NewARCScreen(){
  const {t}=useTranslations('authorCatalog'),{t:common}=useTranslations('common'),router=useRouter(),qc=useQueryClient(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),[bookId,setBookId]=useState(''),[slots,setSlots]=useState('5'),[description,setDescription]=useState('');
  const catalog=useInfiniteQuery({queryKey:['author','books',owner],enabled:!!owner,initialPageParam:null as string|null,queryFn:({pageParam})=>api.get<{actorId:string;books:{id:string;title:string;isbn_13:string|null;language:string}[];nextCursor:string|null}>('/api/author/books',pageParam?{cursor:pageParam}:undefined),getNextPageParam:page=>page.nextCursor}),books=catalog.data?.pages.flatMap(page=>page.books)??[],readerSlots=Number(slots),validSlots=Number.isInteger(readerSlots)&&readerSlots>=1&&readerSlots<=20;
  const create=useMutation({mutationFn:async()=>{const body={book_id:bookId,description:description.trim(),reader_slots:readerSlots},result=await api.post<{arc:{id:string;author_id:string}}>(ENDPOINTS.author.arcs,body,await intent.durableHeaders(body,'author.arc'));if(!result.arc?.id||result.arc.author_id!==owner)throw Error('Invalid ARC receipt');await intent.complete('author.arc');},onSuccess:()=>{if(useAuthStore.getState().user?.id!==owner)return;void qc.invalidateQueries({queryKey:['author','arcs']});router.back();},onError:()=>Alert.alert(common('error'),t('saveFailed'))});
  return <SafeAreaView className="flex-1 bg-background" edges={['bottom']}><ScrollView className="px-4" contentContainerStyle={{paddingTop:16,paddingBottom:32,gap:16}}>
    <View accessibilityRole="radiogroup" className="gap-2"><Text className="font-medium text-foreground">{t('book')}</Text>{catalog.isLoading&&<Text className="text-muted-foreground">{common('loading')}</Text>}{catalog.isError&&<View><Text accessibilityRole="alert" className="text-destructive">{t('loadBooksFailed')}</Text><Button onPress={()=>void catalog.refetch()}>{common('retry')}</Button></View>}{!catalog.isLoading&&!catalog.isError&&!books.length&&<Text className="text-muted-foreground">{t('approvalRequired')}</Text>}{books.map(book=><TouchableOpacity key={book.id} disabled={create.isPending} accessibilityRole="radio" accessibilityState={{checked:bookId===book.id,disabled:create.isPending}} onPress={()=>setBookId(book.id)} className={`rounded-lg border p-3 ${bookId===book.id?'border-accent':'border-border'}`}><Text className="text-foreground">{book.title}</Text><Text className="text-xs text-muted-foreground">{book.isbn_13??book.language}</Text></TouchableOpacity>)}{catalog.hasNextPage&&<Button loading={catalog.isFetchingNextPage} disabled={create.isPending} onPress={()=>void catalog.fetchNextPage()}>{common('loadMore')}</Button>}</View>
    <Input editable={!create.isPending} label={t('slots')} value={slots} onChangeText={setSlots} keyboardType="number-pad" maxLength={2}/><Input editable={!create.isPending} label={t('description')} value={description} onChangeText={setDescription} multiline maxLength={1000} numberOfLines={4} style={{textAlignVertical:'top'}}/>
    <Button onPress={()=>create.mutate()} loading={create.isPending} disabled={!bookId||!description.trim()||!validSlots||catalog.isLoading||catalog.isError} size="lg">{t('createArc')}</Button>
  </ScrollView></SafeAreaView>;
}

import {useState} from 'react';
import {View,Text,TouchableOpacity} from 'react-native';
import {useBookSearch} from '@/hooks/useBooks';
import {useTranslations} from '@/hooks/useTranslations';
import {Input} from '@/components/ui/Input';
import {Button} from '@/components/ui/Button';
import type {BookRow} from '@/types';
export type SelectedBook=Pick<BookRow,'id'|'title'|'author_name'|'isbn_13'|'isbn_10'|'language'|'format'>;
export function BookPicker({value,onChange,disabled=false}:{value:SelectedBook|null;onChange:(book:SelectedBook|null)=>void;disabled?:boolean}){
  const [query,setQuery]=useState(''),{t}=useTranslations('buddyReads'),{t:common}=useTranslations('common'),{t:editions,locale}=useTranslations('editions'),search=useBookSearch(value?'':query);
  function details(book:SelectedBook){let language=book.language;try{language=new Intl.DisplayNames([locale],{type:'language'}).of(language)??language;}catch{}return [book.isbn_13??book.isbn_10,language,book.format?editions('formats.'+book.format):null].filter(Boolean).join(' · ');}
  return <View className="gap-2"><Text className="font-medium text-foreground">{t('book')}</Text>{value?<View className="rounded-lg border border-accent p-3 gap-2"><Text className="text-xs text-accent">{t('selected')}</Text><Text className="text-foreground">{value.title}</Text><Text className="text-sm text-muted-foreground">{value.author_name}</Text><Text className="text-xs text-muted-foreground">{details(value)}</Text><Button variant="outline" disabled={disabled} onPress={()=>onChange(null)}>{t('changeBook')}</Button></View>:<><Input accessibilityLabel={t('search')} placeholder={t('search')} value={query} onChangeText={setQuery} maxLength={200} editable={!disabled}/>{query.trim().length>=2&&<>{search.isFetching&&<Text className="text-muted-foreground">{common('loading')}</Text>}{search.isError?<View><Text accessibilityRole="alert" className="text-destructive">{t('searchFailed')}</Text><Button onPress={()=>void search.refetch()}>{common('retry')}</Button></View>:!search.isFetching&&!search.data?.books.length&&<Text className="text-muted-foreground">{t('noBooks')}</Text>}{!search.isFetching&&search.data?.books.map(book=><TouchableOpacity key={book.id} accessibilityRole="button" disabled={disabled} onPress={()=>onChange(book)} className="rounded-lg border border-border p-3"><Text className="text-foreground">{book.title}</Text><Text className="text-sm text-muted-foreground">{book.author_name}</Text><Text className="text-xs text-muted-foreground">{details(book)}</Text></TouchableOpacity>)}</>}</>}</View>;
}

import {View,Text} from 'react-native';
import {useTranslations} from '@/hooks/useTranslations';
import type {SelectedBook} from '@/components/books/BookPicker';
export function SelectedEdition({book}:{book:SelectedBook}){
  const {t,locale}=useTranslations('editions'),{t:content}=useTranslations('nativeContent');let language=book.language;try{language=new Intl.DisplayNames([locale],{type:'language'}).of(language)??language;}catch{}
  return <View className="rounded-lg border border-border p-3 gap-1"><Text className="text-xs text-muted-foreground">{content('edition')}</Text><Text className="font-semibold text-foreground">{book.title}</Text><Text className="text-sm text-muted-foreground">{book.author_name}</Text><Text className="text-xs text-muted-foreground">{[language,book.format?t('formats.'+book.format):null].filter(Boolean).join(' · ')}</Text>{(book.isbn_13||book.isbn_10)&&<Text className="text-xs text-muted-foreground">{t('isbn',{value:book.isbn_13??book.isbn_10!})}</Text>}</View>;
}

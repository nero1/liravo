import {View} from 'react-native';
import {useTranslations} from '@/hooks/useTranslations';
import {AdminCatalog} from '@/components/admin/Catalog';
import {BookCard} from '@/components/books/BookCard';
import type {BookRow} from '@/types';
export default function AdminBooksScreen(){const {t}=useTranslations('admin'),books=useTranslations('books');return <AdminCatalog<BookRow> scope="books" title={t('books')} searchLabel={books.t('search')} renderItem={({item})=><View className="px-4 py-3 border-b border-border"><BookCard book={item} compact/></View>}/>;}

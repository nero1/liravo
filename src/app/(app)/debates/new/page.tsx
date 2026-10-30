import {getTranslations} from 'next-intl/server';
import {redirect,notFound} from 'next/navigation';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getBookById} from '@/services/books';
import {languageAlternates} from '@/lib/metadata';
import {NewReadingDebate} from '@/components/reading/ReadingCatalogs';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('bookDebates');return {title:t('create'),alternates:languageAlternates('/debates/new')};}
export default async function Page({searchParams}:{searchParams?:{bookId?:string}}){const user=await getCurrentUser();if(!user)redirect('/login');if(searchParams?.bookId&&!z.string().uuid().safeParse(searchParams.bookId).success)notFound();const book=searchParams?.bookId?await getBookById(searchParams.bookId):null;if(searchParams?.bookId&&!book)notFound();return <NewReadingDebate key={user.id+':'+(book?.id??'new')} actorId={user.id} initialBook={book}/>;}

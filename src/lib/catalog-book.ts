import { z } from 'zod';
import type { BookRow } from '@/types/database';

export function normalizedIsbn(value:unknown,length:10|13):string|null{
  if(typeof value!=='string')return null;
  const code=value.replace(/[\s-]/g,'').toUpperCase();
  if(length===13&&/^(?:978\d{10}|979[1-9]\d{9})$/.test(code)&&[...code].reduce((sum,char,index)=>sum+Number(char)*(index%2?3:1),0)%10===0)return code;
  if(length===10&&/^\d{9}[\dX]$/.test(code)&&[...code].reduce((sum,char,index)=>sum+(char==='X'?10:Number(char))*(10-index),0)%11===0)return code;
  return null;
}
export function isbn13From10(code:string){
  const prefix='978'+code.slice(0,9);return prefix+((10-[...prefix].reduce((sum,char,index)=>sum+Number(char)*(index%2?3:1),0)%10)%10);
}
export function editionFormat(value:unknown):BookRow['format']{
  if(typeof value!=='string')return null;
  const binding=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/paperback|softcover|broche|taschenbuch|kartoniert/.test(binding))return 'paperback';
  if(/hardcover|hardback|relie|gebunden/.test(binding))return 'hardcover';
  if(/ebook|e-book|kindle|numerique/.test(binding))return 'ebook';
  if(/audio|horbuch/.test(binding))return 'audiobook';
  return null;
}
export function bookLanguage(value:unknown):string{
  if(typeof value!=='string'||!value.trim()||value.length>20)return 'und';
  const tag=value.trim().replaceAll('_','-');
  if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(tag))return 'und';
  try{return new Intl.Locale(tag).toString();}catch{return 'und';}
}
export function editionNumber(value:unknown,max:number):number|null{
  return typeof value==='number'&&Number.isInteger(value)&&value>0&&value<=max?value:null;
}
const text=(max:number)=>z.string().trim().min(1).max(max);
const optionalText=(max:number)=>text(max).nullish().transform(value=>value??null);
const schema=z.object({
  google_books_id:optionalText(200),open_library_id:z.string().regex(/^\/books\/OL[1-9]\d*M$/).nullish().transform(value=>value??null),
  open_library_work_id:z.string().regex(/^\/works\/OL[1-9]\d*W$/).nullish().transform(value=>value??null),
  work_title:optionalText(500),edition_name:optionalText(200),format:z.enum(['hardcover','paperback','ebook','audiobook']).nullish().transform(value=>value??null),goodreads_id:z.string().regex(/^[1-9]\d{0,19}$/).nullish().transform(value=>value??null),
  title:text(500),subtitle:optionalText(1000),author_name:text(200),author_names:z.array(text(200)).max(100).default([]),
  publisher:optionalText(500),published_year:z.number().int().min(1).max(9999).nullish().transform(value=>value??null),
  description:optionalText(50000),cover_url:z.url().refine(value=>value.startsWith('https://')).nullish().transform(value=>value??null),
  page_count:z.number().int().min(1).max(100000).nullish().transform(value=>value??null),genres:z.array(text(200)).max(100).default([]),
  language:z.unknown().optional().transform(bookLanguage),average_rating:z.number().min(0).max(5).nullish().transform(value=>value??null),ratings_count:z.number().int().nonnegative().default(0),
});

export function catalogBookData(value:unknown){
  const source=value as Record<string,unknown>;
  const data=schema.parse(value);
  const isbn10=normalizedIsbn(source.isbn_10,10);
  let isbn13=normalizedIsbn(source.isbn_13,13);
  if(isbn10){const converted=isbn13From10(isbn10);if(isbn13&&isbn13!==converted)throw new Error('Conflicting edition ISBNs');isbn13??=converted;}
  if(!isbn13&&!isbn10&&!data.google_books_id&&!data.open_library_id&&!data.goodreads_id)throw new Error('Book identity missing');
  const {open_library_work_id,work_title,edition_name,format,...metadata}=data;
  return {...metadata,...(open_library_work_id?{open_library_work_id}:{}),...(work_title?{work_title}:{}),...(edition_name?{edition_name}:{}),...(format?{format}:{}),isbn_10:isbn10,isbn_13:isbn13};
}
export function bookRating(value:unknown):number|null{
  if(value===null||value===undefined||value==='')return null;
  const rating=Number(value);
  return Number.isFinite(rating)&&rating>=0&&rating<=5?rating:null;
}
export function clientBook(book:BookRow):BookRow{
  return {...book,average_rating:bookRating(book.average_rating)};
}

import { z } from 'zod';
import type { BookRow } from '@/types/database';

function isbn(value:unknown,length:number):string|null{
  if(typeof value!=='string')return null;
  const code=value.replace(/[\s-]/g,'').toUpperCase();
  if(length===13&&/^\d{13}$/.test(code)&&[...code].reduce((sum,char,index)=>sum+Number(char)*(index%2?3:1),0)%10===0)return code;
  if(length===10&&/^\d{9}[\dX]$/.test(code)&&[...code].reduce((sum,char,index)=>sum+(char==='X'?10:Number(char))*(10-index),0)%11===0)return code;
  return null;
}
const text=(max:number)=>z.string().trim().min(1).max(max);
const optionalText=(max:number)=>text(max).nullish().transform(value=>value??null);
const schema=z.object({
  google_books_id:optionalText(200),open_library_id:optionalText(200),
  title:text(500),subtitle:optionalText(1000),author_name:text(200),author_names:z.array(text(200)).max(100).default([]),
  publisher:optionalText(500),published_year:z.number().int().min(1).max(9999).nullish().transform(value=>value??null),
  description:optionalText(50000),cover_url:z.url().refine(value=>value.startsWith('https://')).nullish().transform(value=>value??null),
  page_count:z.number().int().min(1).max(100000).nullish().transform(value=>value??null),genres:z.array(text(200)).max(100).default([]),
  language:text(20).default('en'),average_rating:z.number().min(0).max(5).nullish().transform(value=>value??null),ratings_count:z.number().int().nonnegative().default(0),
});

export function catalogBookData(value:unknown){
  const source=value as Record<string,unknown>;
  const data=schema.parse(value);
  const isbn10=isbn(source.isbn_10,10);
  let isbn13=isbn(source.isbn_13,13);
  if(!isbn13&&isbn10){
    const prefix='978'+isbn10.slice(0,9);
    isbn13=prefix+((10-[...prefix].reduce((sum,char,index)=>sum+Number(char)*(index%2?3:1),0)%10)%10);
  }
  if(!isbn13&&!isbn10&&!data.google_books_id&&!data.open_library_id)throw new Error('Book identity missing');
  return {...data,isbn_10:isbn10,isbn_13:isbn13};
}
export function bookRating(value:unknown):number|null{
  if(value===null||value===undefined||value==='')return null;
  const rating=Number(value);
  return Number.isFinite(rating)&&rating>=0&&rating<=5?rating:null;
}
export function clientBook(book:BookRow):BookRow{
  return {...book,average_rating:bookRating(book.average_rating)};
}

import { expect,it } from 'vitest';
import { catalogBookData,clientBook,bookRating,normalizedIsbn,bookLanguage } from '@/lib/catalog-book';
import type { BookRow } from '@/types/database';

it('normalizes valid ISBN-10 identities across catalog providers and rejects corrupt ISBN checksums',()=>{
  const base={title:'A book',author_name:'An author',google_books_id:'volume-1'};
  expect(catalogBookData({...base,isbn_10:'0-306-40615-2'})).toMatchObject({isbn_10:'0306406152',isbn_13:'9780306406157'});
  expect(catalogBookData({...base,isbn_10:'0306406153',isbn_13:'9780306406158'})).toMatchObject({isbn_10:null,isbn_13:null});
  expect(()=>catalogBookData({title:'A book',author_name:'An author',isbn_13:'9780306406158'})).toThrow('identity');
});
it('rejects unusable catalog data and serializes PostgreSQL numeric ratings',()=>{
  for(const extra of [{title:''},{page_count:-1},{average_rating:6},{cover_url:'javascript:alert(1)'}])expect(()=>catalogBookData({title:'Book',author_name:'Author',google_books_id:'volume',...extra})).toThrow();
  expect(clientBook({average_rating:'4.25'} as unknown as BookRow).average_rating).toBe(4.25);
});

it('normalizes numeric rating projections and excludes malformed or out-of-range cached values',()=>{
  expect(bookRating('4.25')).toBe(4.25);expect(bookRating(0)).toBe(0);
  for(const value of [null,undefined,'','invalid',Infinity,-1,6])expect(bookRating(value)).toBeNull();
});

it('keeps edition ISBN pairs consistent and rejects work IDs as edition identities',()=>{
  const base={title:'An edition',author_name:'An author'};
  expect(()=>catalogBookData({...base,isbn_10:'0306406152',isbn_13:'9780141439518'})).toThrow('Conflicting edition');
  expect(()=>catalogBookData({...base,open_library_id:'/works/OL1W'})).toThrow();
  expect(catalogBookData({...base,open_library_id:'/books/OL1M',open_library_work_id:'/works/OL1W'})).toMatchObject({open_library_id:'/books/OL1M',open_library_work_id:'/works/OL1W'});
  expect(normalizedIsbn('4006381333931',13)).toBeNull();
  expect(normalizedIsbn('9790123456785',13)).toBeNull();
});

it('canonicalizes edition language tags and leaves unknown languages undetermined',()=>{
  expect(['eng','fre','fra','ger','deu','en_us'].map(bookLanguage)).toEqual(['en','fr','fr','de','de','en-US']);
  for(const value of [null,undefined,'','English','garbage-lang','en-@'])expect(bookLanguage(value)).toBe('und');
  expect(catalogBookData({title:'Unknown language',author_name:'Author',goodreads_id:'96602'}).language).toBe('und');
});

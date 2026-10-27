import {expect,it} from 'vitest';
import {catalogBookData} from '@/lib/catalog-book';
import {SEED_BOOKS} from '../scripts/seed/data/books';
import {SEED_READING_LISTS} from '../scripts/seed/data/reading-lists';
import {SEED_REVIEWS,SEED_QUOTES} from '../scripts/seed/data/reviews-quotes';
import {SEED_PROMPTS} from '../scripts/seed/data/prompts';

it('keeps seed ISBNs valid and all curated references attached to canonical books',()=>{
  const identities=new Set(SEED_BOOKS.map(book=>book.isbn_13));
  expect(identities.size).toBe(SEED_BOOKS.length);
  for(const book of SEED_BOOKS)expect(catalogBookData(book).isbn_13).toBe(book.isbn_13);
  for(const list of SEED_READING_LISTS){expect(new Set(list.book_isbn_13s).size).toBe(list.book_isbn_13s.length);for(const isbn of list.book_isbn_13s)expect(identities.has(isbn),list.title+': '+isbn).toBe(true);}
  for(const item of [...SEED_REVIEWS,...SEED_QUOTES])expect(identities.has(item.book_isbn_13)).toBe(true);
});
it('keeps seed prompts within the canonical publisher limits',()=>{
  for(const prompt of SEED_PROMPTS){expect(prompt.prompt_text.length).toBeGreaterThanOrEqual(10);expect(prompt.prompt_text.length).toBeLessThanOrEqual(500);expect(prompt.topic_seed.length).toBeLessThanOrEqual(100);}
});

import {expect,it} from 'vitest';
import {parseGoodreadsImport,GOODREADS_MAX_BYTES,GOODREADS_MAX_ROWS} from '@/lib/goodreads-import';

it('parses Goodreads multiline fields, escaped quotes, Excel ISBNs and distinct ISBN headers',()=>{
  const text='\uFEFFBook Id,Title,Author,ISBN13,ISBN,Exclusive Shelf,Date Read\r\n123,"A ""quoted"",\nbook",Author,"=""9780306406157""","=""0306406152""",read,2026/02/28\r\n';
  expect(parseGoodreadsImport(text)).toMatchObject({skipped:0,rows:[{book:{title:'A "quoted",\nbook',goodreads_id:'123',isbn_13:'9780306406157',isbn_10:'0306406152'},shelf:'have_read',finished_at:'2026-02-28'}]});
});
it('retains genuine Goodreads identities without inventing other provider IDs and skips unidentified rows',()=>{
  const result=parseGoodreadsImport('Book Id,Title,Author,ISBN,Exclusive Shelf,Date Read\n124,One,Author,,currently-reading,\n125,Two,Author,,read,2026/02/30\n,No identity,Author,,to-read,');
  expect(result.skipped).toBe(1);expect(result.rows).toHaveLength(2);
  expect(result.rows[0]).toMatchObject({book:{goodreads_id:'124',google_books_id:null,open_library_id:null},shelf:'currently_reading'});
  expect(result.rows[1].finished_at).toBeNull();
});
it('rejects malformed CSV, ambiguous headers, oversized files and excess rows before import',()=>{
  for(const text of ['Title,Title,Author\nA,B,C','Title\nA','Title,Author\n"Unclosed,Author','Title,Author\n"A"bad,Author','Title,Author\nA,Author,extra','Title,Author\nA\0,Author'])expect(()=>parseGoodreadsImport(text)).toThrow();
  expect(()=>parseGoodreadsImport('a'.repeat(GOODREADS_MAX_BYTES+1))).toThrow('2 MB');
  expect(()=>parseGoodreadsImport('Title,Author\n'+Array.from({length:GOODREADS_MAX_ROWS+1},()=> 'A,Author').join('\n'))).toThrow('2000 rows');
});

it('retains edition language, publisher, binding, pages and publication year from Goodreads',()=>{
  const result=parseGoodreadsImport('Book Id,Title,Author,ISBN13,Language,Publisher,Binding,Number of Pages,Year Published,Exclusive Shelf\n96601,Une édition,Auteur,9780306406157,fr,Éditeur,Relié,320,2020,to-read');
  expect(result.rows[0].book).toMatchObject({language:'fr',publisher:'Éditeur',format:'hardcover',page_count:320,published_year:2020});
});

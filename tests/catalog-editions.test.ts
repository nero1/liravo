import {beforeEach,expect,it,vi} from 'vitest';
import {googleVolumeToBookData,openLibraryEditionToBookData,searchOpenLibrary,searchBooks,discoverOpenLibraryEditions} from '@/services/books';
import {fetchWithRetry} from '@/lib/retry';
vi.mock('@/lib/retry',()=>({fetchWithRetry:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/redis',()=>({getRedisClient:vi.fn(),REDIS_KEYS:{},REDIS_TTL:{}}));
const work={key:'/works/OL1W',title:'A work',author_name:['An author']};
const edition={key:'/books/OL1M',title:'An edition',works:[{key:work.key}],isbn_13:['9780306406157'],isbn_10:['0306406152'],number_of_pages:250,publishers:['Edition publisher'],publish_date:'May 12, 2001',languages:[{key:'/languages/fre'}],physical_format:'Paperback'};
beforeEach(()=>vi.clearAllMocks());
it('uses exact edition metadata and keeps canonical work identity separate',()=>{
  expect(openLibraryEditionToBookData(edition,work)).toMatchObject({open_library_id:'/books/OL1M',open_library_work_id:'/works/OL1W',work_title:'A work',title:'An edition',isbn_13:'9780306406157',isbn_10:'0306406152',page_count:250,publisher:'Edition publisher',published_year:2001,language:'fr',format:'paperback'});
  expect(()=>openLibraryEditionToBookData({...edition,key:work.key},work)).toThrow('edition identity');
  expect(()=>openLibraryEditionToBookData({...edition,works:[{key:'/works/OL2W'}]},work)).toThrow('another work');
  expect(()=>openLibraryEditionToBookData({...edition,isbn_10:['0141439513']},work)).toThrow('Ambiguous edition ISBNs');
});
it('resolves a search work to an actual edition instead of pairing work-wide ISBNs',async()=>{
  vi.mocked(fetchWithRetry).mockImplementation(async url=>Response.json(url.includes('/search.json')?{docs:[{...work,edition_key:['OL1M'],isbn:['9780141439518','0306406152'],number_of_pages_median:999,language:['eng']}]}:edition));
  const books=await searchOpenLibrary('A work');expect(books).toHaveLength(1);expect(books[0]).toMatchObject({isbn_13:'9780306406157',page_count:250,language:'fr'});
  expect(vi.mocked(fetchWithRetry).mock.calls[1][0]).toBe('https://openlibrary.org/books/OL1M.json');
});
it('uses exact ISBN lookup and refuses an unrelated returned edition',async()=>{
  vi.mocked(fetchWithRetry).mockResolvedValue(Response.json(edition));
  expect((await searchOpenLibrary('0-306-40615-2'))[0].open_library_id).toBe('/books/OL1M');
  expect(vi.mocked(fetchWithRetry).mock.calls[0][0]).toBe('https://openlibrary.org/isbn/9780306406157.json');
  vi.mocked(fetchWithRetry).mockResolvedValue(Response.json({...edition,isbn_13:['9780141439518'],isbn_10:[]}));
  await expect(searchOpenLibrary('9780306406157')).rejects.toThrow('another edition');
});
it('bounds edition discovery and skips ambiguous records without inventing identities',async()=>{
  vi.mocked(fetchWithRetry).mockResolvedValue(Response.json({entries:[edition,{...edition,key:'/books/OL2M',works:[{key:'/works/OL2W'}]},{...edition,key:'/books/OL3M',isbn_13:['9780306406157','9780141439518']}],size:3}));
  const result=await discoverOpenLibraryEditions({open_library_id:work.key,title:work.title,author_name:'An author'});expect(result.books).toHaveLength(1);expect(result.nextOffset).toBeNull();
  await expect(discoverOpenLibraryEditions({open_library_id:'/books/OL1M',title:work.title,author_name:'An author'})).rejects.toThrow('Invalid work');
});

it('retains provider identities when optional page counts and dates are unknown',()=>{
  expect(openLibraryEditionToBookData({...edition,number_of_pages:0,publish_date:'Unknown'},work)).toMatchObject({page_count:null,published_year:null});
  expect(googleVolumeToBookData({id:'unknown-metadata',volumeInfo:{title:'A book',pageCount:0,publishedDate:'Unknown'}})).toMatchObject({page_count:null,published_year:null});
});

it('rejects oversized or malformed provider edition pages without advancing the cursor',async()=>{
  for(const page of [{entries:Array.from({length:21},()=>edition),size:21},{entries:[edition],size:-1},{entries:[edition]}]){
    vi.mocked(fetchWithRetry).mockResolvedValue(Response.json(page));
    await expect(discoverOpenLibraryEditions({open_library_id:work.key,title:work.title,author_name:'Author'})).rejects.toThrow('Invalid editions page');
  }
});

it('filters Google ISBN results before choosing the exact Open Library edition',async()=>{
  vi.mocked(fetchWithRetry).mockImplementation(async url=>Response.json(url.startsWith('https://www.googleapis.com/')?{items:Array.from({length:3},(_,n)=>({id:'wrong-isbn-'+n,volumeInfo:{title:'Unrelated book',industryIdentifiers:[{type:'ISBN_13',identifier:'9780141439518'}]}}))}:url.includes('/isbn/')?edition:url.includes('/authors/')?{name:'An author'}:{title:'A work'}));
  const books=await searchBooks('0-306-40615-2');expect(books).toHaveLength(1);expect(books[0].isbn_13).toBe('9780306406157');expect(books[0].open_library_id).toBe('/books/OL1M');
});
it('uses an exact Google ISBN result without unnecessary provider fallback',async()=>{
  vi.mocked(fetchWithRetry).mockResolvedValue(Response.json({items:[{id:'matching-isbn',volumeInfo:{title:'Exact edition',industryIdentifiers:[{type:'ISBN_10',identifier:'0306406152'}]}}]}));
  expect((await searchBooks('9780306406157'))[0].isbn_13).toBe('9780306406157');expect(fetchWithRetry).toHaveBeenCalledTimes(1);expect(new URL(vi.mocked(fetchWithRetry).mock.calls[0][0]).searchParams.get('q')).toBe('isbn:9780306406157');
});

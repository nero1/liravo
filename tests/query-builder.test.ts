import { expect, it, vi } from 'vitest';
import { getSql } from '@/lib/db/pg';
import { PgQueryBuilder } from '@/lib/db/query-builder';

vi.mock('@/lib/db/pg',()=>({getSql:vi.fn()}));

it('propagates execution rejection through Promise.all without hanging',async()=>{
  vi.mocked(getSql).mockImplementation(()=>{throw new Error('Database offline');});
  await expect(Promise.all([new PgQueryBuilder('users').select('id')])).rejects.toThrow('Database offline');
});

it('rejects unapproved search dictionaries and modes before constructing SQL',()=>{
  expect(()=>new PgQueryBuilder('books').textSearch('search_vector','query',{config:"simple'); drop table books;--"})).toThrow('Unsupported search language');
  expect(()=>new PgQueryBuilder('books').textSearch('search_vector','query',{type:'raw' as never})).toThrow('Unsupported search mode');
});

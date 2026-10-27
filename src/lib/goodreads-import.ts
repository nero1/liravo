import { catalogBookData } from '@/lib/catalog-book';

export const GOODREADS_MAX_BYTES=2_000_000;
export const GOODREADS_MAX_ROWS=2000;
function csvRecords(text:string){
  if(new TextEncoder().encode(text).length>GOODREADS_MAX_BYTES)throw new Error('CSV exceeds 2 MB');
  if(text.includes('\0'))throw new Error('Invalid CSV');
  const records:string[][]=[];let record:string[]=[],field='',quoted=false,closed=false;
  const finishField=()=>{record.push(field);field='';closed=false;if(record.length>100)throw new Error('Too many CSV columns');};
  const finishRecord=()=>{finishField();if(record.some(value=>value.trim()))records.push(record);record=[];if(records.length>GOODREADS_MAX_ROWS+1)throw new Error('CSV exceeds 2000 rows');};
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=char;}
    else if(char===',')finishField();
    else if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;finishRecord();}
    else if(char==='"'){if(field||closed)throw new Error('Invalid CSV quoting');quoted=true;}
    else{if(closed){if(char!==' '&&char!=='\t')throw new Error('Invalid CSV quoting');}else field+=char;}
    if(field.length>50000)throw new Error('CSV field too long');
  }
  if(quoted)throw new Error('Unclosed CSV field');
  if(field||record.length||closed)finishRecord();
  return records;
}
function readDate(value:string){
  const match=/^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(value.trim());if(!match)return null;
  const date=`${match[1]}-${match[2]}-${match[3]}`;
  const parsed=new Date(date+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
}
export function parseGoodreadsImport(text:string){
  const [header,...records]=csvRecords(text);
  if(!header)throw new Error('CSV header required');
  const names=header.map(value=>value.trim().toLowerCase().replace(/\s+/g,' '));
  if(new Set(names).size!==names.length||!names.includes('title')||!names.includes('author'))throw new Error('CSV requires unique Title and Author columns');
  const get=(record:string[],...keys:string[])=>{const index=keys.map(key=>names.indexOf(key)).find(index=>index>=0);return index===undefined?'':(record[index]??'').trim();};
  const cleanIsbn=(value:string)=>value.replace(/^="([^"]*)"$/,'$1');
  const rows=[];let skipped=0;
  for(const record of records){
    if(record.length!==header.length)throw new Error('CSV column count mismatch');
    const title=get(record,'title'),author=get(record,'author')||'Unknown',sourceId=get(record,'book id');
    if(!title||title.length>500||author.length>200){skipped++;continue;}
    try{
      const book=catalogBookData({title,author_name:author,goodreads_id:/^[1-9]\d{0,19}$/.test(sourceId)?sourceId:null,isbn_10:cleanIsbn(get(record,'isbn')),isbn_13:cleanIsbn(get(record,'isbn13','isbn 13'))});
      const shelves=get(record,'exclusive shelf','bookshelves','shelf').toLowerCase().split(',').map(value=>value.trim());
      const shelf=shelves.includes('read')?'have_read':shelves.includes('currently-reading')?'currently_reading':'want_to_read';
      rows.push({book,shelf,finished_at:shelf==='have_read'?readDate(get(record,'date read')):null});
    }catch{skipped++;}
  }
  return {rows,skipped};
}

import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

const keySchema=z.record(z.string(),z.string());
const cursorSchema=z.object({user:z.uuid(),job:z.uuid(),dataset:z.number().int().min(0).max(200),key:keySchema.nullable(),first:z.boolean(),expires:z.number().int()});
export const exportJobSchema=z.object({id:z.uuid(),actorId:z.uuid(),format:z.enum(['json','csv']),createdAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),datasets:z.array(z.object({dataset:z.string(),single:z.boolean()})).min(1).max(200)});
export const exportPageSchema=z.object({actorId:z.uuid(),jobId:z.uuid(),dataset:z.string(),records:z.array(z.object({key:keySchema,data:z.record(z.string(),z.unknown())})).max(1000),complete:z.boolean(),nextKey:keySchema.nullable()});
export type ExportCursor=z.infer<typeof cursorSchema>;
function secret(){const key=Buffer.from(process.env.AUTH_ENCRYPTION_KEY??'','base64');if(key.length!==32)throw Error('Export signing unavailable');return key;}
export function signExportCursor(cursor:ExportCursor){const body=Buffer.from(JSON.stringify(cursor)).toString('base64url');return body+'.'+createHmac('sha256',secret()).update('account-export:'+body).digest('base64url');}
export function readExportCursor(value:string,user:string){
 if(value.length>4000)throw Error('Invalid export cursor');
 const [body,signature,...extra]=value.split('.'),expected=createHmac('sha256',secret()).update('account-export:'+body).digest(),actual=Buffer.from(signature??'','base64url');
 if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Invalid export cursor');
 const cursor=cursorSchema.parse(JSON.parse(Buffer.from(body,'base64url').toString()));
 if(cursor.user!==user||cursor.expires<=Date.now())throw Error('Export expired or unavailable');return cursor;
}
export const csvHeaders=['Title','Author','ISBN13','ISBN','Language','Binding','Publisher','Year Published','Number of Pages','Shelf','Exclusive Shelf','Date Added','Date Started','Date Read','Pages Read','Progress Percent','Edition','Liravo Book ID','Google Books ID','Open Library ID','Book Id'];
export function csvExportCell(value:unknown){let text=String(value??'');if(typeof value==='string'&&/^[\s]*[=+\-@]|^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
function csvReadingRow(entry:Record<string,unknown>){const b=z.record(z.string(),z.unknown()).parse(entry.books),s=z.record(z.string(),z.unknown()).parse(entry.shelves);return[b.title,b.author_name,b.isbn_13,b.isbn_10,b.language,b.format,b.publisher,b.published_year,b.page_count,s.name,({have_read:'read',currently_reading:'currently-reading',want_to_read:'to-read'}as Record<string,string>)[String(s.default_type)]??'to-read',entry.added_at,entry.started_at,entry.finished_at,entry.progress_pages,entry.progress_percent,entry.edition_read,b.id,b.google_books_id,b.open_library_id,b.goodreads_id].map(csvExportCell).join(',')+'\r\n';}
export function exportFragment(job:z.infer<typeof exportJobSchema>,cursor:ExportCursor,page:z.infer<typeof exportPageSchema>){
 const descriptor=job.datasets[cursor.dataset];if(!descriptor||page.dataset!==descriptor.dataset||page.actorId!==cursor.user||page.jobId!==cursor.job||!page.complete&&(!page.nextKey||!page.records.length))throw Error('Invalid export page');
 let text='';
 if(job.format==='csv'){if(cursor.first)text=csvHeaders.map(csvExportCell).join(',')+'\r\n';text+=page.records.map(record=>csvReadingRow(record.data)).join('');}
 else{
  if(cursor.dataset===0&&cursor.first)text='{"version":2,"exported_at":'+JSON.stringify(job.createdAt);
  if(cursor.first)text+=','+JSON.stringify(descriptor.dataset)+':'+(descriptor.single?'':'[');
  if(descriptor.single){if(!page.complete||page.records.length>1)throw Error('Invalid singleton export');text+=JSON.stringify(page.records[0]?.data??null);}
  else{text+=(cursor.first||!page.records.length?'':',')+page.records.map(record=>JSON.stringify(record.data)).join(',');if(page.complete)text+=']';}
 }
 const complete=page.complete&&cursor.dataset===job.datasets.length-1;
 if(complete&&job.format==='json')text+='}';
 const next=complete?null:signExportCursor({...cursor,dataset:cursor.dataset+(page.complete?1:0),key:page.complete?null:page.nextKey,first:page.complete});
 return {actorId:cursor.user,jobId:cursor.job,text,nextCursor:next,complete};
}

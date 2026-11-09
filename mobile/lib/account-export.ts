import {File,Paths,FileMode} from 'expo-file-system';
import {randomUUID}from'expo-crypto';
import * as Sharing from 'expo-sharing';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';

export async function shareAccountExport(dialogTitle:string){
 const {user,token}=useAuthStore.getState(),actor=user?.id;if(!actor||!token)throw Error('Account unavailable');
 const current=()=>useAuthStore.getState().user?.id===actor&&useAuthStore.getState().token===token;
 if(!await Sharing.isAvailableAsync())return 'unavailable';if(!current())return 'account_changed';
 const job=await api.post<{actorId:string;jobId:string;cursor:string}>('/api/users/export',{format:'json'},{'Idempotency-Key':randomUUID(),'X-Liravo-Actor':actor});
 if(!current())return 'account_changed';if(job.actorId!==actor||!job.cursor)throw Error('Invalid export');
 const file=new File(Paths.cache,'liravo-export-'+randomUUID()+'.json');let handle;
 try{
  await file.create();handle=await file.open(FileMode.WriteOnly);let cursor:string|null=job.cursor;
  while(cursor){
   if(!current())return 'account_changed';
   let chunk:{actorId:string;jobId:string;text:string;nextCursor:string|null;complete:boolean}|undefined;
   for(let attempt=0;attempt<3;attempt++){try{chunk=await api.get('/api/users/export',{cursor});break;}catch(error){const failure=error as {status?:number;retryAfter?:number};if(attempt===2||failure.status&&![429,502,503,504].includes(failure.status))throw error;await new Promise(resolve=>setTimeout(resolve,failure.status===429?Math.max(1,failure.retryAfter||60)*1000:1000*(attempt+1)));if(!current())return 'account_changed';}}
   if(!current())return 'account_changed';if(!chunk||chunk.actorId!==actor||chunk.jobId!==job.jobId||typeof chunk.text!=='string'||chunk.text.length>2000000||chunk.nextCursor!==null&&(typeof chunk.nextCursor!=='string'||!chunk.nextCursor||chunk.nextCursor===cursor)||chunk.complete!==(chunk.nextCursor===null))throw Error('Invalid export chunk');
   await handle.writeBytes(new TextEncoder().encode(chunk.text));cursor=chunk.nextCursor;
  }
  await handle.close();handle=undefined;if(!current())return 'account_changed';
  await Sharing.shareAsync(file.uri,{mimeType:'application/json',UTI:'public.json',dialogTitle});return 'shared';
 }finally{try{if(handle)await handle.close();}finally{try{file.delete();}catch{}}}
}

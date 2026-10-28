import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {api} from '@/lib/api';
import {useAuthStore} from '@/stores/auth';

export async function shareAccountExport(dialogTitle:string){
  const {user,token}=useAuthStore.getState(),actor=user?.id;
  if(!actor||!token)throw new Error('Account unavailable');
  const current=()=>useAuthStore.getState().user?.id===actor&&useAuthStore.getState().token===token;
  if(!await Sharing.isAvailableAsync())return 'unavailable';
  if(!current())return 'account_changed';
  const data=await api.get<{profile:{id:string};reading_history:unknown[]}>('/api/users/export');
  if(data.profile?.id!==actor||!Array.isArray(data.reading_history))throw new Error('Invalid export');
  if(!current())return 'account_changed';
  if(!FileSystem.cacheDirectory)throw new Error('Export storage unavailable');
  const file=FileSystem.cacheDirectory+'liravo-export-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.json';
  try{
    await FileSystem.writeAsStringAsync(file,JSON.stringify(data,null,2));
    if(!current())return 'account_changed';
    await Sharing.shareAsync(file,{mimeType:'application/json',UTI:'public.json',dialogTitle});
    return 'shared';
  }finally{await FileSystem.deleteAsync(file,{idempotent:true}).catch(()=>{});}
}

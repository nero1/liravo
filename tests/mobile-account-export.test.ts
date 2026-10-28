import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function harness(){
  const state={user:{id:'reader-a'},token:'token-a'},write=vi.fn(async(_path:string,_contents:string)=>{}),remove=vi.fn(async(_path:string,_options:{idempotent:boolean})=>{}),share=vi.fn(async(_path:string,_options:unknown)=>{}),read=vi.fn(async()=>({profile:{id:'reader-a'},reading_history:[]}));
  const exports:any={},code=ts.transpileModule(readFileSync('mobile/lib/account-export.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,require:(name:string)=>{
    if(name==='expo-file-system')return {cacheDirectory:'file:///private-cache/',writeAsStringAsync:write,deleteAsync:remove};
    if(name==='expo-sharing')return {isAvailableAsync:async()=>true,shareAsync:share};
    if(name==='@/lib/api')return {api:{get:read}};
    if(name==='@/stores/auth')return {useAuthStore:{getState:()=>state}};
    throw Error('Unexpected dependency '+name);
  }});
  return {state,write,remove,share,read,run:exports.shareAccountExport as (title:string)=>Promise<string>};
}
it('shares an authenticated JSON export from private cache and removes the temporary file',async()=>{
  const app=harness();expect(await app.run('Exporter les données')).toBe('shared');expect(app.read).toHaveBeenCalledWith('/api/users/export');expect(app.share.mock.calls[0][1]).toMatchObject({mimeType:'application/json',dialogTitle:'Exporter les données'});expect(app.remove).toHaveBeenCalledWith(app.write.mock.calls[0][0],{idempotent:true});
});
it('does not expose a previous account’s export after an account switch',async()=>{
  const app=harness();app.write.mockImplementation(async()=>{app.state.user={id:'reader-b'};app.state.token='token-b';});expect(await app.run('Export')).toBe('account_changed');expect(app.share).not.toHaveBeenCalled();expect(app.remove).toHaveBeenCalledOnce();
});
it('removes temporary export files when the platform share dialog fails',async()=>{
  const app=harness();app.share.mockRejectedValueOnce(Error('Sharing failed'));await expect(app.run('Export')).rejects.toThrow('Sharing failed');expect(app.remove).toHaveBeenCalledOnce();
});

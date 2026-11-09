import {expect,it,vi}from'vitest';
import {readFileSync}from'node:fs';
import {runInNewContext}from'node:vm';
import {TextEncoder}from'node:util';
import ts from'typescript';
function harness(){
 const state={user:{id:'reader-a'},token:'token-a'},write=vi.fn(async(_bytes:Uint8Array)=>{}),remove=vi.fn(),close=vi.fn(),share=vi.fn(async(_path:string,_options:unknown)=>{}),read=vi.fn(async()=>({actorId:'reader-a',jobId:'job-a',text:'{"profile":{"id":"reader-a"}}',nextCursor:null,complete:true}));
 const exports:any={},code=ts.transpileModule(readFileSync('mobile/lib/account-export.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 runInNewContext(code,{exports,TextEncoder,require:(name:string)=>{
  if(name==='expo-file-system')return {File:class{uri='file:///private-cache/export.json';create(){}async open(){return {writeBytes:write,close};}delete(){remove();}},Paths:{cache:'file:///private-cache/'},FileMode:{WriteOnly:'write'}};
  if(name==='expo-crypto')return {randomUUID:()=>crypto.randomUUID()};
  if(name==='expo-sharing')return {isAvailableAsync:async()=>true,shareAsync:share};
  if(name==='@/lib/api')return {api:{post:async()=>({actorId:'reader-a',jobId:'job-a',cursor:'cursor-a'}),get:read}};
  if(name==='@/stores/auth')return {useAuthStore:{getState:()=>state}};throw Error('Unexpected dependency '+name);
 }});
 return{state,write,remove,close,share,read,run:exports.shareAccountExport as(title:string)=>Promise<string>};
}
it('writes bounded chunks to a private file, closes it, shares it, and deletes it',async()=>{const app=harness();expect(await app.run('Exporter les données')).toBe('shared');expect(app.read).toHaveBeenCalledWith('/api/users/export',{cursor:'cursor-a'});expect(app.write).toHaveBeenCalledWith(new TextEncoder().encode('{"profile":{"id":"reader-a"}}'));expect(app.close).toHaveBeenCalledOnce();expect(app.share.mock.calls[0][1]).toMatchObject({mimeType:'application/json',dialogTitle:'Exporter les données'});expect(app.remove).toHaveBeenCalledOnce();});
it('discards a previous account’s export after an account switch',async()=>{const app=harness();app.write.mockImplementation(async()=>{app.state.user={id:'reader-b'};app.state.token='token-b';});expect(await app.run('Export')).toBe('account_changed');expect(app.share).not.toHaveBeenCalled();expect(app.remove).toHaveBeenCalledOnce();});
it('deletes temporary files when sharing fails',async()=>{const app=harness();app.share.mockRejectedValueOnce(Error('Sharing failed'));await expect(app.run('Export')).rejects.toThrow('Sharing failed');expect(app.remove).toHaveBeenCalledOnce();});
it('rejects another actor’s chunk and deletes the unfinished file',async()=>{const app=harness();app.read.mockResolvedValueOnce({actorId:'reader-b',jobId:'job-a',text:'secret',nextCursor:null,complete:true});await expect(app.run('Export')).rejects.toThrow('Invalid export chunk');expect(app.write).not.toHaveBeenCalled();expect(app.share).not.toHaveBeenCalled();expect(app.remove).toHaveBeenCalledOnce();});

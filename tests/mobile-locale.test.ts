import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function preferences(storage:{getItem:ReturnType<typeof vi.fn>;setItem:ReturnType<typeof vi.fn>}){
  let state:any;
  const exports:any={};
  const code=ts.transpileModule(readFileSync('mobile/stores/preferences.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,require:(name:string)=>{
    if(name==='zustand')return {create:(initialize:any)=>{state=initialize((patch:object)=>Object.assign(state,patch),()=>state);return {getState:()=>state};}};
    if(name==='@react-native-async-storage/async-storage')return {default:storage};
    throw Error('Unexpected dependency '+name);
  }});
  return exports.usePreferences.getState();
}
it('does not replace an authenticated preference with a late stored locale',async()=>{
  let release:(value:string)=>void=()=>{};
  const storage={getItem:vi.fn(()=>new Promise<string>(resolve=>{release=resolve;})),setItem:vi.fn(async()=>{})},store=preferences(storage);
  const hydration=store.hydrate();
  await store.setLocale('fr');release('de');await hydration;
  expect(store.locale).toBe('fr');expect(storage.setItem).toHaveBeenLastCalledWith('liravo_locale','fr');
});
it('serializes locale persistence and rolls back only the failed current choice',async()=>{
  let release:()=>void=()=>{};
  const writes:string[]=[],storage={getItem:vi.fn(async()=>null),setItem:vi.fn((_:string,value:string)=>{writes.push(value);return value==='fr'?new Promise<void>(resolve=>{release=resolve;}):Promise.resolve();})},store=preferences(storage);
  await store.hydrate();const first=store.setLocale('fr'),second=store.setLocale('de');await Promise.resolve();await Promise.resolve();
  expect(writes).toEqual(['fr']);release();await Promise.all([first,second]);expect(writes).toEqual(['fr','de']);expect(store.locale).toBe('de');
  storage.setItem.mockRejectedValueOnce(Error('Storage unavailable'));await expect(store.setLocale('en')).rejects.toThrow('Storage unavailable');expect(store.locale).toBe('de');
});
it('ignores unsupported persisted locales and tolerates unavailable preference storage',async()=>{
  for(const getItem of [vi.fn(async()=> 'es'),vi.fn(async()=>{throw Error('Storage unavailable');})]){
    const store=preferences({getItem,setItem:vi.fn(async()=>{})});await store.hydrate();expect(store.locale).toBeNull();expect(store.hydrated).toBe(true);
  }
});

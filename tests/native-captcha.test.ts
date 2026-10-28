import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function mount(){
  const slots:any[]=[],effects:(()=>void)[]=[],proof=vi.fn(),closed=vi.fn();let cursor=0,sequence=0;
  const hooks={useState:(value:unknown)=>{const index=cursor++;if(!(index in slots))slots[index]=value;return [slots[index],(next:any)=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},useRef:(value:unknown)=>{const index=cursor++;return slots[index]??(slots[index]={current:value});},useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const index=cursor++,old=slots[index];if(!old||JSON.stringify(old.deps)!==JSON.stringify(deps)){old?.cleanup?.();slots[index]={deps};effects.push(()=>{slots[index].cleanup=effect();});}}};
  const exports:{HCaptchaChallenge?:(props:unknown)=>any}={};
  const code=ts.transpileModule(readFileSync('mobile/components/auth/HCaptchaChallenge.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(code,{exports,URL,URLSearchParams,require:(name:string)=>{
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})};
    if(name==='react-native')return {Modal:'Modal',View:'View',Text:'Text',ActivityIndicator:'ActivityIndicator'};
    if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};
    if(name==='react-native-webview')return {WebView:'WebView'};
    if(name==='expo-crypto')return {randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`};
    if(name==='@/constants/api')return {API_BASE:'https://app.test'};
    if(name==='@/hooks/useTranslations')return {useTranslations:()=>({locale:'fr',t:(key:string)=>key})};
    if(name==='@/components/ui/Button')return {Button:'Button'};
    throw new Error('Unexpected native dependency: '+name);
  }});
  function render(visible=true){cursor=0;let tree=exports.HCaptchaChallenge!({visible,onProof:proof,onClose:closed});while(effects.length)effects.shift()!();cursor=0;tree=exports.HCaptchaChallenge!({visible,onProof:proof,onClose:closed});return tree;}
  const find=(tree:any,type:string):any=>{if(!tree)return undefined;if(Array.isArray(tree))return tree.map(node=>find(node,type)).find(Boolean);if(tree.type===type)return tree;return find(tree.props?.children,type);};
  return {render,find,proof,closed};
}
it('accepts one proof only from the application page and matching challenge nonce',()=>{
  const harness=mount(),tree=harness.render(),view=harness.find(tree,'WebView'),url=new URL(view.props.source.uri),nonce=new URLSearchParams(url.hash.slice(1)).get('nonce');
  expect(url.origin+url.pathname).toBe('https://app.test/auth/captcha');expect(url.searchParams.get('lang')).toBe('fr');
  const event=(data:unknown,source=url.toString())=>({nativeEvent:{data:JSON.stringify(data),url:source}});
  view.props.onMessage(event({nonce,token:'valid-proof'},'https://foreign.test/auth/captcha'));
  view.props.onMessage(event({nonce:'foreign-nonce',token:'valid-proof'}));view.props.onMessage(event({nonce,token:'x'.repeat(8193)}));view.props.onMessage(event(null));expect(harness.proof).not.toHaveBeenCalled();
  view.props.onMessage(event({nonce,token:'valid-proof'}));view.props.onMessage(event({nonce,token:'valid-proof'}));expect(harness.proof).toHaveBeenCalledExactlyOnceWith('valid-proof');
  for(const target of ['https://foreign.test','https://hcaptcha.com.foreign.test','https://app.test/settings','javascript:alert(1)','http://newassets.hcaptcha.com/frame'])expect(view.props.onShouldStartLoadWithRequest({url:target})).toBe(false);
  for(const target of [url.toString(),'https://newassets.hcaptcha.com/frame','about:blank'])expect(view.props.onShouldStartLoadWithRequest({url:target})).toBe(true);
});
it('invalidates late proofs immediately on cancellation, page failure and challenge replacement',()=>{
  const harness=mount(),first=harness.render(),firstView=harness.find(first,'WebView'),firstUrl=new URL(firstView.props.source.uri),firstNonce=new URLSearchParams(firstUrl.hash.slice(1)).get('nonce');
  harness.find(first,'Modal').props.onRequestClose();firstView.props.onMessage({nativeEvent:{url:firstUrl.toString(),data:JSON.stringify({nonce:firstNonce,token:'late-proof'})}});expect(harness.closed).toHaveBeenCalledOnce();expect(harness.proof).not.toHaveBeenCalled();
  harness.render(false);const next=harness.render(),nextView=harness.find(next,'WebView'),nextUrl=new URL(nextView.props.source.uri),nonce=new URLSearchParams(nextUrl.hash.slice(1)).get('nonce');expect(nonce).not.toBe(firstNonce);
  nextView.props.onMessage({nativeEvent:{url:nextUrl.toString(),data:JSON.stringify({nonce:firstNonce,token:'stale-proof'})}});expect(harness.proof).not.toHaveBeenCalled();
  nextView.props.onHttpError();nextView.props.onMessage({nativeEvent:{url:nextUrl.toString(),data:JSON.stringify({nonce,token:'late-proof'})}});expect(harness.proof).not.toHaveBeenCalled();
});

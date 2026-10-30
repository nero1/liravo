import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createTranslator} from 'next-intl';
import fr from '../messages/fr.json';

const sku='liravo_premium_monthly',purchase=(token:string)=>({productId:sku,purchaseToken:token,purchaseStateAndroid:1}),receipt=(active=true)=>({actorId:'reader',user:{id:'reader',is_premium:active},active,pending:false,acknowledged:true});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function mount(){
  const state={user:{id:'reader',is_premium:false}},slots:any[]=[],effects:any[]=[],alerts=vi.fn(),post=vi.fn(),qc={invalidateQueries:vi.fn()},setUser=vi.fn(user=>{state.user=user;}),store=Object.assign((selector:any)=>selector(state),{getState:()=>({...state,setUser})});let cursor=0,updated:any,failed:any,locale='fr';
  const product={productId:sku,subscriptionOfferDetails:[{offerId:null,offerToken:'monthly',pricingPhases:{pricingPhaseList:[{billingPeriod:'P1M',formattedPrice:'4,99 €'}]}}]},iap={initConnection:vi.fn(async()=>true),endConnection:vi.fn(async()=>{}),getSubscriptions:vi.fn(async()=>[product]),getAvailablePurchases:vi.fn(async()=>[] as any[]),requestSubscription:vi.fn(async()=>{}),finishTransaction:vi.fn(async()=>{}),purchaseUpdatedListener:vi.fn(callback=>{updated=callback;return{remove:vi.fn()};}),purchaseErrorListener:vi.fn(callback=>{failed=callback;return{remove:vi.fn()};}),PurchaseStateAndroid:{PURCHASED:1}};
  post.mockImplementation(async(path:string)=>path.endsWith('billing-account')?{actorId:'reader',accountId:'a'.repeat(64)}:receipt());
  const same=(a:any[],b:any[])=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]),exports:any={},offer:any={};runInNewContext(ts.transpileModule(readFileSync('mobile/lib/google-play-offer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:offer});
  runInNewContext(ts.transpileModule(readFileSync('mobile/hooks/useGooglePlayBilling.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require(name:string){
    if(name==='react')return{useState:(value:any)=>{const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],(next:any)=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef:(value:any)=>{const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];},useCallback:(callback:any,deps:any[])=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:callback,deps};return slots[i].value;},useEffect:(effect:any,deps:any[])=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=effect();});}}};
    if(name==='react-native')return{Platform:{OS:'android'},Alert:{alert:alerts}};if(name==='react-native-iap')return iap;if(name==='@tanstack/react-query')return{useQueryClient:()=>qc};if(name==='@/stores/auth')return{useAuthStore:store};if(name==='@/lib/api')return{api:{post}};if(name==='@/constants/iap')return{SUBSCRIPTION_SKUS:[sku],PREMIUM_MONTHLY_SKU:sku};if(name==='@/lib/google-play-offer')return offer;if(name==='@/hooks/useTranslations')return{useTranslations:()=>({t:createTranslator({locale,messages:fr,namespace:'nativeBilling',onError:error=>{throw error;}})})};throw Error(name);
  }});
  function render(){cursor=0;const value=exports.useGooglePlayBilling();while(effects.length)effects.shift()();return value;}
  return{render,post,iap,alerts,setUser,qc,state,updated:(value:any)=>updated(value),failed:(value:any)=>failed(value),setLocale:(value:string)=>{locale=value;},unmount:()=>{for(const slot of slots)slot?.cleanup?.();}};
}
it('restores every unique supported receipt so an expired first receipt cannot hide an active later purchase',async()=>{
  const v=mount();v.iap.getAvailablePurchases.mockResolvedValue([purchase('expired'),purchase('active'),purchase('active'),{...purchase('other'),productId:'another-product'}]);v.post.mockImplementation(async(_path,body:any)=>receipt(body.purchaseToken==='active'));v.render();await flush();await v.render().restorePurchases();expect(v.post.mock.calls.map(([,body])=>body.purchaseToken)).toEqual(['expired','active']);expect(v.alerts).toHaveBeenLastCalledWith(fr.nativeBilling.restoredTitle,fr.nativeBilling.restoredMessage);expect(v.setUser).toHaveBeenLastCalledWith(expect.objectContaining({id:'reader',is_premium:true}));expect(v.iap.finishTransaction).not.toHaveBeenCalled();v.unmount();
});
it('preserves pending verification and reports partial restore failures without claiming all receipts succeeded',async()=>{
  const v=mount();v.iap.getAvailablePurchases.mockResolvedValue([purchase('unavailable'),purchase('active')]);v.post.mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValueOnce(receipt());v.render();await flush();await v.render().restorePurchases();expect(v.alerts).toHaveBeenLastCalledWith(fr.nativeBilling.restoredTitle,fr.nativeBilling.partiallyRestoredMessage);
  v.iap.getAvailablePurchases.mockResolvedValue([purchase('pending')]);v.post.mockResolvedValueOnce({...receipt(false),pending:true,acknowledged:false});await v.render().restorePurchases();expect(v.alerts).toHaveBeenLastCalledWith(fr.nativeBilling.pendingTitle,fr.nativeBilling.pendingMessage);expect(v.iap.finishTransaction).not.toHaveBeenCalled();v.unmount();
});
it('deduplicates concurrent purchase events and acknowledges only an owned active receipt',async()=>{
  const v=mount();let resolve:any;v.post.mockReturnValue(new Promise(r=>{resolve=r;}));v.render();await flush();v.updated(purchase('same'));v.updated(purchase('same'));await flush();expect(v.post).toHaveBeenCalledTimes(1);resolve({...receipt(),acknowledged:false});await flush();expect(v.iap.finishTransaction).toHaveBeenCalledTimes(1);expect(v.post).toHaveBeenCalledWith('/api/mobile/verify-purchase',expect.objectContaining({purchaseToken:'same'}),{'X-Liravo-Actor':'reader'});v.unmount();
});
it('rejects foreign acknowledgements and discards responses after an account switch',async()=>{
  const v=mount();v.post.mockResolvedValueOnce({...receipt(),actorId:'someone-else'});v.render();await flush();v.updated(purchase('forged'));await flush();expect(v.setUser).not.toHaveBeenCalled();expect(v.iap.finishTransaction).not.toHaveBeenCalled();expect(v.alerts).toHaveBeenLastCalledWith(fr.nativeBilling.verificationFailedTitle,fr.nativeBilling.verificationFailedMessage);
  let resolve:any;v.post.mockReturnValueOnce(new Promise(r=>{resolve=r;}));v.updated(purchase('late'));v.state.user={id:'other-reader',is_premium:false};resolve({...receipt(),acknowledged:false});await flush();expect(v.setUser).not.toHaveBeenCalled();expect(v.iap.finishTransaction).not.toHaveBeenCalled();v.unmount();
});
it('binds a monthly purchase to the owned billing account and rejects a foreign binding before opening Play',async()=>{
  const v=mount();v.render();await flush();expect(v.render().premiumPrice).toBe('4,99 €');await v.render().subscribe();expect(v.iap.requestSubscription).toHaveBeenCalledWith({subscriptionOffers:[{sku,offerToken:'monthly'}],obfuscatedAccountIdAndroid:'a'.repeat(64)});
  v.iap.requestSubscription.mockClear();v.post.mockResolvedValueOnce({actorId:'someone-else',accountId:'a'.repeat(64)});await v.render().subscribe();expect(v.iap.requestSubscription).not.toHaveBeenCalled();expect(v.alerts).toHaveBeenLastCalledWith(fr.nativeBilling.purchaseFailedTitle,fr.nativeBilling.purchaseFailedMessage);v.unmount();
});
it('makes store setup failure retryable and suppresses cancelled or unfinished purchases',async()=>{
  const v=mount();v.iap.initConnection.mockRejectedValueOnce(new Error('Unavailable'));v.render();await flush();expect(v.render().storeError).toBe(true);v.render().retryStore();v.render();await flush();expect(v.render().connected).toBe(true);v.failed({code:'E_USER_CANCELLED',message:'English SDK details'});v.updated({...purchase('unfinished'),purchaseStateAndroid:2});await flush();expect(v.alerts).not.toHaveBeenCalled();expect(v.post).not.toHaveBeenCalled();v.unmount();
});

it('does not open a purchase sheet after the billing account response arrives for a replaced account',async()=>{
  const v=mount();let resolve:any;v.post.mockReturnValueOnce(new Promise(r=>{resolve=r;}));v.render();await flush();const pending=v.render().subscribe();v.state.user={id:'another-reader',is_premium:false};resolve({actorId:'reader',accountId:'a'.repeat(64)});await pending;expect(v.iap.requestSubscription).not.toHaveBeenCalled();expect(v.alerts).not.toHaveBeenCalled();v.unmount();
});
it('serializes connection cleanup before a new account starts billing setup',async()=>{
  const v=mount();let resolve:any;v.iap.initConnection.mockReturnValueOnce(new Promise(r=>{resolve=r;}));v.render();await flush();v.state.user={id:'new-reader',is_premium:false};v.render();expect(v.iap.initConnection).toHaveBeenCalledTimes(1);resolve(true);await flush();expect(v.iap.endConnection).toHaveBeenCalledTimes(1);expect(v.iap.initConnection).toHaveBeenCalledTimes(2);expect(v.iap.getSubscriptions).toHaveBeenCalledTimes(1);expect(v.render().connected).toBe(true);v.unmount();
});

it('keeps a new account purchase locked when an older account request finishes late',async()=>{
  const v=mount();let oldResolve:any,newResolve:any;v.post.mockReturnValueOnce(new Promise(r=>{oldResolve=r;})).mockReturnValueOnce(new Promise(r=>{newResolve=r;}));v.render();await flush();const old=v.render().subscribe();v.state.user={id:'new-reader',is_premium:false};v.render();await flush();const current=v.render().subscribe();expect(v.post).toHaveBeenCalledTimes(2);oldResolve({actorId:'reader',accountId:'a'.repeat(64)});await old;await v.render().subscribe();expect(v.post).toHaveBeenCalledTimes(2);newResolve({actorId:'new-reader',accountId:'b'.repeat(64)});await current;expect(v.iap.requestSubscription).toHaveBeenCalledTimes(1);expect(v.iap.requestSubscription).toHaveBeenCalledWith(expect.objectContaining({obfuscatedAccountIdAndroid:'b'.repeat(64)}));v.unmount();
});

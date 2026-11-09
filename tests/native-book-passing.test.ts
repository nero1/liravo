import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createTranslator} from 'next-intl';
import fr from '../messages/fr.json';
function mount(query:any={}){
 const queries:any[]=[],mutations:any[]=[],get=vi.fn(),post=vi.fn(),complete=vi.fn(),state={user:{id:'reader'}},exports:any={},translator=createTranslator({locale:'fr',messages:fr,onError:error=>{throw error;}});
 runInNewContext(ts.transpileModule(readFileSync('mobile/app/pass-the-book/index.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Intl,require(name:string){
  if(name==='react')return{useState:(value:any)=>[value,vi.fn()],useEffect:()=>{},useRef:(value:any)=>({current:value})};if(name==='react/jsx-runtime')return{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props})};if(name==='react-native')return{View:'View',Text:'Text',FlatList:'FlatList',Alert:{alert:vi.fn()}};if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView'};
  if(name==='@tanstack/react-query')return{useInfiniteQuery:(options:any)=>{queries.push(options);return query;},useQuery:()=>({}),useMutation:(options:any)=>{mutations.push(options);return{mutateAsync:vi.fn(),isPending:false};},useQueryClient:()=>({invalidateQueries:vi.fn()})};
  if(name==='@/stores/auth')return{useAuthStore:Object.assign((selector:any)=>selector(state),{getState:()=>state})};if(name==='@/hooks/useTranslations')return{useTranslations:(namespace:string)=>({locale:'fr',t:(key:string,values:any)=>translator(namespace+'.'+key as never,values)})};if(name==='@/hooks/useRequestIntent')return{useRequestIntent:()=>({durableHeaders:async()=>({'Idempotency-Key':'durable-pass-key','X-Liravo-Actor':'reader'}),complete})};if(name==='@/lib/api')return{api:{get,post}};
  if(name==='@/components/ui/EmptyState')return{EmptyState:'EmptyState',QueryError:'QueryError'};const component=name.match(/^@\/components\/(?:ui|books)\/(\w+)$/);if(component)return{[component[1]]:component[1]};throw Error(name);
 }});
 const all=(tree:any,type:string):any[]=>!tree?[]:Array.isArray(tree)?tree.flatMap(node=>all(node,type)):[...(tree.type===type?[tree]:[]),...all(tree.props?.children,type)];return{exports,render:(props:any,name:string)=>exports[name](props),all,queries,mutations,get,post,complete,state};
}
it('uses complete native catalogs with full totals, owned pages and correct continuation query parameters',async()=>{
 const view=mount({data:{pages:[{items:[],total:45}]},hasNextPage:true}),tree=view.render({actorId:'reader'},'OwnedBookPassingScreen'),list=view.all(tree,'FlatList')[0];expect(JSON.stringify(list.props.ListHeaderComponent)).toContain('45 entrées');expect(JSON.stringify(list.props.ListFooterComponent)).toContain(fr.common.loadMore);
 for(const query of view.queries){const field=query.queryKey.at(-1)==='chains'?'chains':'items';view.get.mockResolvedValueOnce({actorId:'reader',[field]:[],total:45,nextCursor:'next'});await query.queryFn({pageParam:'cursor'});const args=view.get.mock.calls.at(-1)!;expect(args[0]).not.toContain('?');expect(args[1]).toMatchObject({cursor:'cursor'});if(field==='items')expect(args[1].scope).toBe(query.queryKey.at(-1));}
 view.get.mockResolvedValueOnce({actorId:'other',chains:[]});await expect(view.queries[0].queryFn({pageParam:null})).rejects.toThrow();
});
it('does not display a false empty state after read failure',()=>{const view=mount({isError:true,error:Error('Unavailable')}),list=view.all(view.render({actorId:'reader'},'OwnedBookPassingScreen'),'FlatList')[0];expect(list.props.ListEmptyComponent).toBeUndefined();expect(view.all(list.props.ListFooterComponent,'QueryError')).toHaveLength(1);});
it('uses authoritative membership before offering nomination and retains complete edition context',()=>{
 const view=mount(),tree=view.render({actorId:'reader',chain:{id:'chain',books:{id:'edition',title:'Book',language:'fr',format:'paperback'},reader_count:45,can_nominate:false}},'NativeChainCard');expect(view.all(tree,'SelectedEdition')[0].props.book.id).toBe('edition');expect(JSON.stringify(tree)).toContain('45 lecteurs');expect(JSON.stringify(tree)).toContain(fr.passTheBook.noNomination);expect(view.all(tree,'Input')).toHaveLength(0);expect(view.queries[0].enabled).toBe(false);
});
it('recovers a lost native response with the original owned key and retains invalid acknowledgements',async()=>{
 const view=mount();view.exports.useBookPassingMutation('reader','book_passes','book.pass');const mutation=view.mutations[0],receipt={actorId:'reader',pass:{id:'pass',sender_id:'reader',recipient_id:'next',book_id:'edition',message:null}},task={path:'/api/pass-the-book',body:{book_id:'edition',recipient_id:'next'}};
 view.post.mockRejectedValueOnce(Error('Lost'));view.get.mockResolvedValueOnce(receipt);await mutation.mutationFn(task);expect(view.get).toHaveBeenLastCalledWith('/api/pass-the-book',{action:'book_passes',receipt:'durable-pass-key'});expect(view.complete).toHaveBeenCalledExactlyOnceWith('book.pass','durable-pass-key');
 view.complete.mockClear();view.post.mockResolvedValueOnce({...receipt,actorId:'other'});view.get.mockResolvedValueOnce({...receipt,actorId:'other'});await expect(mutation.mutationFn(task)).rejects.toThrow();expect(view.complete).not.toHaveBeenCalled();view.post.mockImplementationOnce(async()=>{view.state.user.id='switched';return receipt;});await expect(mutation.mutationFn(task)).rejects.toThrow();expect(view.complete).not.toHaveBeenCalled();
});
it('checks selected edition, recipient and chain instead of accepting a bare success flag',()=>{const{validReceipt}=mount().exports;expect(validReceipt({actorId:'reader',success:true},'reader','chain_nominate','chain')).toBe(false);expect(validReceipt({actorId:'reader',success:true,chainId:'other',nomineeId:'next',position:1},'reader','chain_nominate','chain')).toBe(false);expect(validReceipt({actorId:'reader',pass:{id:'pass',sender_id:'reader',recipient_id:'next',book_id:'other',message:null}},'reader','book_passes',undefined,{book_id:'edition',recipient_id:'next'})).toBe(false);});

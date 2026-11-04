import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createTranslator} from 'next-intl';
import fr from '../messages/fr.json';
function mount(file:string,query:any={}){
 const queries:any[]=[],mutations:any[]=[],get=vi.fn(),post=vi.fn(),complete=vi.fn(),state={user:{id:'staff'}},exports:any={},translate=createTranslator({locale:'fr',messages:fr,onError:error=>{throw error;}});
 runInNewContext(ts.transpileModule(readFileSync('mobile/app/moderation/'+file+'.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Intl,require(name:string){
  if(name==='react')return{useState:(value:any)=>[value,vi.fn()],useEffect:()=>{}};
  if(name==='react/jsx-runtime')return{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props})};
  if(name==='react-native')return{View:'View',Text:'Text',FlatList:'FlatList',Alert:{alert:vi.fn()}};
  if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView'};
  if(name==='@tanstack/react-query')return{useInfiniteQuery:(options:any)=>{queries.push(options);return query;},useMutation:(options:any)=>{mutations.push(options);return{mutate:vi.fn(),isPending:false};},useQueryClient:()=>({invalidateQueries:vi.fn()})};
  if(name==='@/hooks/useTranslations')return{useTranslations:(namespace:string)=>({locale:'fr',t:(key:string,values:any)=>translate(namespace+'.'+key as never,values),has:(key:string)=>translate.has(namespace+'.'+key as never)})};
  if(name==='@/stores/auth')return{useAuthStore:Object.assign((selector:any)=>selector(state),{getState:()=>state})};
  if(name==='@/hooks/useRequestIntent')return{useRequestIntent:()=>({durableHeaders:async()=>({'Idempotency-Key':'owned-key','X-Liravo-Actor':'staff'}),complete})};
  if(name==='@/lib/api')return{api:{get,post}};
  if(name==='@/components/ui/EmptyState')return{EmptyState:'EmptyState',QueryError:'QueryError'};
  if(name==='@/components/ui/Button')return{Button:'Button'};if(name==='@/components/ui/Input')return{Input:'Input'};throw Error(name);
 }});
 const all=(tree:any,type:string):any[]=>!tree?[]:Array.isArray(tree)?tree.flatMap(node=>all(node,type)):[...(tree.type===type?[tree]:[]),...all(tree.props?.children,type)];
 return{render:(props:any={},name='default')=>exports[name](props),all,queries,mutations,get,post,complete,state};
}
const report={id:'report',entity_type:'review',reason:'Flag',status:'pending',created_at:'2026-11-04T12:00:00Z',reporter:{display_name:'Reader',username:'reader'},target:{label:'Book',content:'Safe & decoded preview'},moderator:null,allowed_actions:['approve','remove','warn','escalate']};
it('pages native reports and logs using actual response fields and rejects another actor',async()=>{
 for(const[file,field]of[['reports','reports'],['log','logs']]){const view=mount(file,{data:{pages:[{[field]:[{id:'one'}],total:2},{[field]:[{id:'two'}],total:2}]},hasNextPage:true}),list=view.all(view.render(),'FlatList')[0];expect(list.props.data).toHaveLength(2);expect(JSON.stringify(list.props.ListFooterComponent)).toContain(fr.common.loadMore);view.get.mockResolvedValueOnce({actorId:'staff',[field]:[],nextCursor:'next',total:45});await expect(view.queries[0].queryFn({pageParam:'cursor'})).resolves.toMatchObject({nextCursor:'next'});expect(view.get).toHaveBeenLastCalledWith('/api/moderation/'+file,expect.objectContaining({cursor:'cursor'}),undefined);view.get.mockResolvedValueOnce({actorId:'other',[field]:[]});await expect(view.queries[0].queryFn({pageParam:null})).rejects.toThrow();}
});
it('renders translated actual audit actions and joined staff names instead of empty data',()=>{
 const view=mount('log',{data:{pages:[{logs:[],total:0}]}}),list=view.all(view.render(),'FlatList')[0],row=list.props.renderItem({item:{id:'log',action:'approved',moderator:{username:'staff',display_name:'Équipe'},entity_type:'review',created_at:'2026-11-04T12:00:00Z'}});expect(JSON.stringify(row)).toContain(fr.moderation.statuses.approved);expect(JSON.stringify(row)).toContain('Équipe (@staff)');
});
it('does not turn failed reads into empty-success states',()=>{
 for(const file of['reports','log']){const view=mount(file,{isError:true,error:Error('Unavailable')}),list=view.all(view.render(),'FlatList')[0];expect(list.props.ListEmptyComponent).toBeNull();expect(view.all(list.props.ListFooterComponent,'QueryError')).toHaveLength(1);}
});
it('only offers permitted decisions and translates content context',()=>{
 const view=mount('reports'),tree=view.render({owner:'staff',report:{...report,allowed_actions:[]}},'NativeReportReview');expect(view.all(tree,'Button')).toHaveLength(0);expect(JSON.stringify(tree)).toContain(fr.moderation.noActions);expect(JSON.stringify(tree)).toContain('Safe & decoded preview');const account=view.render({owner:'staff',report:{...report,entity_type:'user',allowed_actions:['remove']}},'NativeReportReview');expect(JSON.stringify(account)).toContain(fr.moderation.actions.suspend);
});
it('recovers lost decision responses with the same owned key and keeps foreign receipts pending',async()=>{
 const view=mount('reports');view.render({owner:'staff',report},'NativeReportReview');const mutation=view.mutations[0],receipt={actorId:'staff',reportId:'report',report:{id:'report',status:'removed',moderator_id:'staff',moderator_note:null}};
 view.post.mockRejectedValueOnce(Error('Response lost'));view.get.mockResolvedValueOnce(receipt);await mutation.mutationFn('remove');expect(view.get).toHaveBeenLastCalledWith('/api/moderation/reports',{reportId:'report',receipt:'owned-key'});expect(view.complete).toHaveBeenCalledExactlyOnceWith('report-action:report','owned-key');
 view.complete.mockClear();view.post.mockResolvedValueOnce({...receipt,actorId:'other'});view.get.mockResolvedValueOnce({...receipt,actorId:'other'});await expect(mutation.mutationFn('remove')).rejects.toThrow();expect(view.complete).not.toHaveBeenCalled();
 view.post.mockImplementationOnce(async()=>{view.state.user.id='switched';return receipt;});await expect(mutation.mutationFn('remove')).rejects.toThrow();expect(view.complete).not.toHaveBeenCalled();
});

import {expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createTranslator} from 'next-intl';
import fr from '../messages/fr.json';
import {CRON_JOBS} from '../src/constants/cron';

function mount(file:string,query:any={}){
  const state={user:{id:'admin',is_admin:true}},queries:any[]=[],mutations:any[]=[],changes:any[]=[],get=vi.fn(),patch=vi.fn(),complete=vi.fn(),mutate=vi.fn(),alert=vi.fn(),invalidateQueries=vi.fn(),exports:any={},translate=createTranslator({locale:'fr',messages:fr,onError:error=>{throw error;}}),store=Object.assign((selector:any)=>selector(state),{getState:()=>state});
  runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Intl,require(name:string){
    if(name==='react')return{useState:(value:any)=>[value,vi.fn()],useEffect:()=>{}};if(name==='react/jsx-runtime')return{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props}),Fragment:'Fragment'};
    if(name==='react-native')return{View:'View',Text:'Text',FlatList:'FlatList',ScrollView:'ScrollView',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',Switch:'Switch',Alert:{alert}};if(name==='expo-crypto')return{CryptoDigestAlgorithm:{SHA256:'SHA256'},digestStringAsync:async(_algorithm:string,value:string)=>createHash('sha256').update(value).digest('hex')};if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView'};
    if(name==='@tanstack/react-query')return{useInfiniteQuery:(options:any)=>{queries.push(options);return query;},useQuery:(options:any)=>{queries.push(options);return query.byKey?.[options.queryKey.at(-1)]??query;},useMutation:(options:any)=>{mutations.push(options);return{mutate,isPending:false};},useQueryClient:()=>({invalidateQueries})};
    if(name==='@/hooks/useTranslations')return{useTranslations:(namespace:string)=>({locale:'fr',t:(key:string,values:any)=>translate([namespace,key].filter(Boolean).join('.') as never,values),has:(key:string)=>translate.has([namespace,key].filter(Boolean).join('.') as never)})};
    if(name==='@/stores/auth')return{useAuthStore:store};if(name==='@/hooks/useAdminChange')return{useAdminChange:(options:any)=>{changes.push(options);return{mutate,isPending:false};}};if(name==='@/hooks/useRequestIntent')return{useRequestIntent:()=>({durableHeaders:async()=>({'Idempotency-Key':'owned-admin-intent','X-Liravo-Actor':'admin'}),complete})};
    if(name==='@/lib/api')return{api:{get,patch},ApiError:Error};if(name==='@/constants/api')return{ENDPOINTS:{health:'/api/health',admin:{users:'/api/admin/users',books:'/api/admin/books',themes:'/api/admin/themes',promotedListings:'/api/admin/promoted-listings',seasonalEvents:'/api/admin/seasonal-events',writingChallenges:'/api/admin/writing-challenges',featureFlags:'/api/admin/feature-flags',affiliateStores:'/api/admin/affiliate-stores',cronStatus:'/api/admin/cron-status'}}};
    if(name==='@/components/admin/Catalog')return{AdminCatalog:'AdminCatalog'};if(name==='@/components/ui/EmptyState')return{EmptyState:'EmptyState',QueryError:'QueryError'};if(name.endsWith('/constants/cron'))return{CRON_JOBS};if(name==='expo-router')return{useRouter:()=>({push:vi.fn()})};const component=name.match(/^@\/components\/(?:ui|books)\/(\w+)$/);if(component)return{[component[1]]:component[1]};throw Error(name);
  }});
  const all=(tree:any,type:string):any[]=>!tree?[]:Array.isArray(tree)?tree.flatMap(node=>all(node,type)):[...(tree.type===type?[tree]:[]),...all(tree.props?.children,type)];
  return{render:(props:any={},name='default')=>exports[name](props),all,get,patch,queries,mutations,changes,complete,mutate,alert,state,invalidateQueries};
}
it('pages every native admin catalog with owned responses and complete totals instead of a silent cap',async()=>{
  const view=mount('mobile/components/admin/Catalog.tsx',{data:{pages:[{rows:[{id:'one'},{id:'two'}],total:619,nextCursor:'next'}]},hasNextPage:true});const tree=view.render({scope:'users',title:'Utilisateurs',renderItem:()=>null},'AdminCatalog'),list=view.all(tree,'FlatList')[0];expect(list.props.data).toHaveLength(2);expect(JSON.stringify(list.props.ListHeaderComponent)).toContain('619');expect(JSON.stringify(list.props.ListFooterComponent)).toContain(fr.common.loadMore);view.get.mockResolvedValueOnce({actorId:'someone-else',users:[],total:0,nextCursor:null});await expect(view.queries[0].queryFn({pageParam:null})).rejects.toThrow('Invalid admin catalog');
  view.get.mockResolvedValueOnce({actorId:'admin',users:[{id:'last'}],total:619,nextCursor:null});await expect(view.queries[0].queryFn({pageParam:'cursor'})).resolves.toMatchObject({rows:[{id:'last'}]});expect(view.get).toHaveBeenLastCalledWith('/api/admin/users',{search:'',cursor:'cursor'},undefined);
});
it('uses the actual user moderation fields and localizes the confirmation',()=>{
  const view=mount('mobile/app/admin/users.tsx'),tree=view.render(),catalog=view.all(tree,'AdminCatalog')[0],row=catalog.props.renderItem({item:{id:'target',username:'reader',display_name:'Lecteur',is_suspended:false}});view.all(row,'TouchableOpacity')[0].props.onPress();const args=view.alert.mock.calls[0];expect(args[0]).toBe(fr.nativeAdmin.actions);args[2][1].onPress();expect(view.mutate).toHaveBeenCalledWith({userId:'target',is_suspended:true});expect(view.changes[0].validate({updated:true,userId:'someone-else'},{userId:'target'})).toBe(false);
});
it('uses theme names as identities and the actual seasonal event name',async()=>{
  const themes=mount('mobile/app/admin/theme.tsx'),theme=themes.all(themes.render(),'AdminCatalog')[0],row=theme.props.renderItem({item:{name:'Night theme',is_active:false}});themes.all(row,'Switch')[0].props.onValueChange(true);expect(themes.mutate).toHaveBeenCalledWith({name:'Night theme',is_active:true});expect(await themes.changes[0].scope({name:'A/B'})).not.toBe(await themes.changes[0].scope({name:'A?B'}));expect(themes.changes[0].validate({ok:true,theme:{name:'Other',is_active:true}},{name:'Night theme',is_active:true})).toBe(false);
  const events=mount('mobile/app/admin/seasonal-events.tsx'),catalog=events.all(events.render(),'AdminCatalog')[0],event=catalog.props.renderItem({item:{id:'event',name:'Nom réel',start_date:'2026-01-01T00:00:00Z',end_date:'2026-02-01T00:00:00Z',is_published:true}});expect(JSON.stringify(event)).toContain('Nom réel');expect(JSON.stringify(event)).toContain(fr.nativeAdmin.published);
});
it('retains mutation intents for foreign receipts and completes only the acknowledged key',async()=>{
  const view=mount('mobile/hooks/useAdminChange.ts');view.render({path:'/admin',catalog:'users',scope:()=> 'admin.user.target',validate:(data:any)=>data.updated===true},'useAdminChange');const mutation=view.mutations[0];view.patch.mockResolvedValueOnce({actorId:'another-admin',updated:true});await expect(mutation.mutationFn({userId:'target'})).rejects.toThrow('Invalid admin receipt');expect(view.complete).not.toHaveBeenCalled();view.patch.mockResolvedValueOnce({actorId:'admin',updated:true});await mutation.mutationFn({userId:'target'});expect(view.complete).toHaveBeenCalledExactlyOnceWith('admin.user.target','owned-admin-intent');let resolve:any;view.patch.mockReturnValueOnce(new Promise(r=>{resolve=r;}));const pending=mutation.mutationFn({userId:'target'});await new Promise(setImmediate);view.state.user.id='switched-admin';resolve({actorId:'admin',updated:true});await expect(pending).rejects.toThrow('Invalid admin receipt');expect(view.complete).toHaveBeenCalledTimes(1);
});
it('loads real cron/integrity data alongside health and exposes unavailable counters',()=>{
  const view=mount('mobile/app/admin/cron-status.tsx',{byKey:{health:{data:{status:'degraded',timestamp:'2026-10-30T00:00:00Z',services:{database:'ok',redis:'error'}}},'cron-status':{data:{pending:12,failed:3,anomalies:{pendingRefunds:4},operations:null}}}}),tree=view.render(),text=JSON.stringify(tree);expect(text).toContain(fr.admin.cron.anomalies.pendingRefunds);expect(text).toContain(fr.admin.cron.operationsUnavailable);expect(text).toContain(fr.nativeAdmin.statuses.degraded);view.queries[1].queryFn({});expect(view.get).toHaveBeenCalledWith('/api/admin/cron-status',undefined,undefined);
});
it('renders translated admin navigation and read failures without false empty data',()=>{
  const menu=mount('mobile/app/admin/index.tsx');expect(JSON.stringify(menu.render())).toContain(fr.admin.featureFlags);for(const file of['feature-flags','affiliate-stores']){const view=mount('mobile/app/admin/'+file+'.tsx',{error:new Error('Unavailable')});expect(view.all(view.render(),'QueryError')).toHaveLength(1);}
});

it('preserves legacy promotions without an end date and sends the desired activation state',()=>{
  const view=mount('mobile/app/admin/promoted-listings.tsx'),catalog=view.all(view.render(),'AdminCatalog')[0],row=catalog.props.renderItem({item:{id:'promotion',is_active:false,end_date:null,book:{title:'Book'}}});expect(JSON.stringify(row)).toContain(fr.nativeAdmin.noEndDate);expect(JSON.stringify(row)).not.toContain('1970');view.all(row,'Switch')[0].props.onValueChange(true);expect(view.mutate).toHaveBeenCalledWith({id:'promotion',is_active:true});
});

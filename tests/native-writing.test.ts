import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createTranslator} from 'next-intl';
import fr from '../messages/fr.json';

class ApiError extends Error{constructor(public status:number){super('Isolated failure');}}
function mount(file:string,query:any,infinite:any={data:undefined}){
  const slots:any[]=[],mutations:any[]=[],queries:any[]=[],completions=vi.fn(),get=vi.fn(),post=vi.fn(),push=vi.fn();let cursor=0;
  const owner={id:'reader',username:'reader'},store=Object.assign((selector?:any)=>selector?selector({user:owner}):{user:owner},{getState:()=>({user:owner})}),translate=createTranslator({locale:'fr',messages:fr,onError:error=>{throw error;}});
  const exports:any={},code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(code,{exports,Intl,Map,Error,require:(name:string)=>{
    if(name==='react')return {useEffect:()=>{},useState:(value:unknown)=>{const index=cursor++;if(!(index in slots))slots[index]=value;return [slots[index],(next:unknown)=>{slots[index]=next;}];}};
    if(name==='react/jsx-runtime')return {jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props}),Fragment:'Fragment'};
    if(name==='react-native')return {View:'View',Text:'Text',ScrollView:'ScrollView',FlatList:'FlatList',TouchableOpacity:'TouchableOpacity',Alert:{alert:vi.fn()},KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'},ActivityIndicator:'ActivityIndicator'};
    if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};
    if(name==='expo-router')return {useLocalSearchParams:()=>({id:'workshop-id',username:'writer'}),useRouter:()=>({push,back:vi.fn()})};
    if(name==='@tanstack/react-query')return {useQuery:(options:unknown)=>{queries.push(options);return query;},useInfiniteQuery:(options:unknown)=>{queries.push(options);return infinite;},useMutation:(options:unknown)=>{mutations.push(options);return {mutate:vi.fn(),isPending:false};},useQueryClient:()=>({invalidateQueries:vi.fn(),setQueryData:(key:unknown,update:(value:unknown)=>unknown)=>{const target=Array.isArray(key)&&key.includes('question')?infinite:query;target.data=update(target.data);}})};
    if(name==='@/hooks/useTranslations')return {useTranslations:(namespace='')=>({locale:'fr',t:(key:string,values?:Record<string,string|number>)=>translate([namespace,key].filter(Boolean).join('.') as Parameters<typeof translate>[0],values)})};
    if(name==='@/stores/auth')return {useAuthStore:store};
    if(name==='@/hooks/useRequestIntent')return {useRequestIntent:()=>({durableHeaders:async()=>({'Idempotency-Key':'durable-writing-key','X-Liravo-Actor':'reader'}),complete:completions})};
    if(name==='@/lib/api')return {api:{get,post},ApiError};
    if(name==='@/constants/api')return {ENDPOINTS:{author:{arcs:'/author/arcs',byUsername:(name:string)=>'/author/'+name,createPost:'/author/posts'},write:{questions:'/questions',workshops:'/workshops',workshopById:(id:string)=>'/workshops/'+id,workshopSubmissions:(id:string)=>'/workshops/'+id+'/submissions',workshopFeedback:(id:string,draft:string)=>'/workshops/'+id+'/submissions/'+draft+'/feedback',joinWorkshop:(id:string)=>'/workshops/'+id+'/join',promptById:()=>'/prompt',submitPrompt:()=>'/prompt/submit'}}};
    if(name==='@/components/social/FollowButton')return {FollowButton:'FollowButton'};
    if(name==='@/components/ui/EmptyState')return {QueryError:'QueryError',EmptyState:'EmptyState'};
    const match=name.match(/^@\/components\/ui\/(\w+)$/);if(match)return {[match[1]]:match[1]};throw Error(name);
  }});
  function render(){cursor=0;mutations.length=0;queries.length=0;return exports.default();}
  const find=(tree:any,type:string):any=>{if(!tree)return undefined;if(Array.isArray(tree))return tree.map(node=>find(node,type)).find(Boolean);if(tree.type===type)return tree;return find(tree.props?.children,type);};
  return {render,find,mutations,queries,post,get,completions,push};
}
it('renders the actual workshop catalog contract and exposes query failures instead of an empty list',()=>{
  const data={pages:[{rooms:[{id:'room',name:'Atelier',topic:'Écriture',member_count:1}],nextCursor:null}]},view=mount('mobile/app/write/workshops/index.tsx',{}, {data});
  expect(view.find(view.render(),'FlatList').props.data).toHaveLength(1);
  const failure=mount('mobile/app/write/workshops/index.tsx',{}, {error:new Error('Unavailable')});expect(failure.find(failure.render(),'QueryError')).toBeTruthy();
});
it('shows a join action for nonmembers without rendering private drafts',()=>{
  const view=mount('mobile/app/write/workshops/[id].tsx',{error:new ApiError(403)},{data:{pages:[{submissions:[{id:'private',title:'PRIVATE DRAFT',excerpt:'PRIVATE CONTENT'}]}]}}),tree=view.render();
  expect(JSON.stringify(tree)).not.toContain('PRIVATE CONTENT');expect(JSON.stringify(tree)).toContain(fr.nativeWriting.membersOnly);expect(view.find(tree,'Button').props.children).toBe(fr.nativeWriting.joinWorkshop);expect(view.queries[1].enabled).toBe(false);
});
it('keeps a draft intent until the API acknowledges the owned submission',async()=>{
  const view=mount('mobile/app/write/workshops/[id].tsx',{data:{actorId:'reader',room:{id:'workshop-id',name:'Atelier',is_active:true,member_count:1}}},{data:{pages:[{submissions:[],nextCursor:null}]}});
  view.render();view.post.mockResolvedValueOnce({submission:{id:'draft',user_id:'someone-else'}});await expect(view.mutations[1].mutationFn()).rejects.toThrow('Invalid draft receipt');expect(view.completions).not.toHaveBeenCalled();
  view.post.mockResolvedValueOnce({submission:{id:'draft',user_id:'reader'}});await view.mutations[1].mutationFn();expect(view.completions).toHaveBeenCalledExactlyOnceWith('workshop.draft.workshop-id');
});
it('uses the prompt response label for the French prompt submission action',()=>{
  const view=mount('mobile/app/write/prompts/[id].tsx',{data:{prompt:{id:'prompt',prompt:'Un sujet'}}}),tree=view.render();expect(view.find(tree,'Button').props.children).toBe(fr.writing.submitResponse);
});

it('shows the committed prompt response after reopening without offering another submission',()=>{
  const view=mount('mobile/app/write/prompts/[id].tsx',{data:{actorId:'reader',prompt:{id:'prompt',prompt:'Un sujet'},submission:{id:'saved',content:'My recovered response'}}}),tree=view.render();expect(JSON.stringify(tree)).toContain('My recovered response');expect(view.find(tree,'Input')).toBeUndefined();expect(view.find(tree,'Button')).toBeUndefined();
});

it('renders an acknowledged prompt response immediately while retaining the owned receipt',async()=>{
  const view=mount('mobile/app/write/prompts/[id].tsx',{data:{actorId:'reader',prompt:{id:'prompt',prompt:'Un sujet'},submission:null}});view.render();view.post.mockResolvedValue({submission:{id:'saved',user_id:'reader',content:'An acknowledged response'}});const result=await view.mutations[0].mutationFn();view.mutations[0].onSuccess(result);expect(JSON.stringify(view.render())).toContain('An acknowledged response');expect(view.find(view.render(),'Input')).toBeUndefined();
});

it('renders every approved native ARC edition and preserves the intent until an owned acknowledgement',async()=>{
  const view=mount('mobile/app/author/arcs/new.tsx',{}, {data:{pages:[{books:[{id:'one',title:'First approved edition'}]},{books:[{id:'two',title:'Second approved edition'}]}]}}),tree=view.render();
  expect(JSON.stringify(tree)).toContain('First approved edition');expect(JSON.stringify(tree)).toContain('Second approved edition');expect(JSON.stringify(tree)).toContain(fr.authorCatalog.createArc);
  view.post.mockResolvedValueOnce({arc:{id:'saved',author_id:'different-author'}});await expect(view.mutations[0].mutationFn()).rejects.toThrow('Invalid ARC receipt');expect(view.completions).not.toHaveBeenCalled();
  view.post.mockResolvedValueOnce({arc:{id:'saved',author_id:'reader'}});await view.mutations[0].mutationFn();expect(view.completions).toHaveBeenCalledExactlyOnceWith('author.arc');
});
it('renders native author profile failures instead of a permanent spinner',()=>{
  const view=mount('mobile/app/author/[username].tsx',{}, {error:new ApiError(404)});expect(view.find(view.render(),'QueryError')).toBeTruthy();
});
it('renders every native author catalog page and the real follower count',()=>{
  const author={id:'writer',username:'writer',display_name:'Writer',is_verified_author:true};
  const view=mount('mobile/app/author/[username].tsx',{data:{qa:[]}}, {data:{pages:[{author,posts:[],followerCount:7,books:[{id:'first',title:'First catalog edition'}]},{books:[{id:'second',title:'Second catalog edition'}]}]}}),tree=JSON.stringify(view.render());
  expect(tree).toContain('First catalog edition');expect(tree).toContain('Second catalog edition');expect(tree).toContain('7 abonnés');expect(tree).toContain(fr.authorProfile.verified);
});

it('opens writer question threads from every native catalog page',()=>{
  const question=(id:string)=>({id,question:'A useful writing question',answer_count:0,created_at:'2026-10-29T00:00:00Z',author:{display_name:'Writer'}}),view=mount('mobile/app/write/ask.tsx',{}, {data:{pages:[{questions:[question('one')]},{questions:[question('two')]}]}}),list=view.find(view.render(),'FlatList');
  expect(list.props.data).toHaveLength(2);list.props.renderItem({item:question('two')}).props.onPress();expect(view.push).toHaveBeenCalledWith('/write/ask/two');
});
it('pins the native best answer while keeping ineligible readers out of the answer form',()=>{
  const author={id:'writer',username:'writer',display_name:'Writer'},thread={question:{id:'workshop-id',question:'A useful question',answer_count:1,author},bestAnswer:{id:'best',answer:'The selected answer',author,created_at:'2026-10-29T00:00:00Z'},answers:[],canAnswer:false,isOwner:false};
  const view=mount('mobile/app/write/ask/[id].tsx',{}, {data:{pages:[thread]}}),list=view.find(view.render(),'FlatList');expect(JSON.stringify(list.props.ListHeaderComponent)).toContain(fr.writerQuestions.bestAnswer);expect(view.find(list.props.ListFooterComponent,'TextInput')).toBeUndefined();
});
it('keeps native answer receipts until the acknowledged question and author both match',async()=>{
  const author={id:'reader',username:'reader',display_name:'Reader'},thread={question:{id:'workshop-id',question:'A useful question',answer_count:0,author},bestAnswer:null,answers:[],canAnswer:true,isOwner:false},view=mount('mobile/app/write/ask/[id].tsx',{}, {data:{pages:[thread]}});view.render();
  const row={id:'answer',user_id:'reader',question_id:'workshop-id',answer:'A detailed acknowledged answer',created_at:'2026-10-29T00:00:00Z',author};
  view.post.mockResolvedValueOnce({actorId:'reader',answer:{...row,question_id:'different'}});await expect(view.mutations[0].mutationFn()).rejects.toThrow('Invalid answer receipt');expect(view.completions).not.toHaveBeenCalled();
  view.post.mockResolvedValueOnce({actorId:'reader',answer:row});const saved=await view.mutations[0].mutationFn();view.mutations[0].onSuccess(saved);expect(view.completions).toHaveBeenCalledExactlyOnceWith('writing.answer.workshop-id');const list=view.find(view.render(),'FlatList');expect(list.props.data[0].id).toBe('answer');expect(JSON.stringify(list.props.ListHeaderComponent)).toContain('1 réponse');
});
it('keeps native best-answer receipts when the acknowledgement belongs to another account',async()=>{
  const author={id:'reader',username:'reader',display_name:'Reader'},thread={question:{id:'workshop-id',question:'A useful question',answer_count:1,author},bestAnswer:null,answers:[],canAnswer:false,isOwner:true},view=mount('mobile/app/write/ask/[id].tsx',{}, {data:{pages:[thread]}});view.render();
  view.post.mockResolvedValue({ok:true,actorId:'someone-else',questionId:'workshop-id',answerId:'answer'});await expect(view.mutations[1].mutationFn({id:'answer'})).rejects.toThrow('Invalid best answer receipt');expect(view.completions).not.toHaveBeenCalled();
});

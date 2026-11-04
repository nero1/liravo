import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useAuthStore} from '@/stores/auth';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import type { ShelfRow,ShelfCatalogPage,ShelfDetailPage } from '@/types';

export function useShelves(bookId?:string,enabled=true){
 const owner=useAuthStore(state=>state.user?.id),query=useInfiniteQuery({queryKey:['shelves',bookId,owner],enabled:enabled&&!!owner,initialPageParam:null as string|null,
  queryFn:async({pageParam,signal})=>{const result=await api.get<ShelfCatalogPage>(ENDPOINTS.shelves.list,{bookId,cursor:pageParam??undefined},signal);if(useAuthStore.getState().user?.id!==owner||result.actorId!==owner||result.bookId!==(bookId??null)||!Array.isArray(result.shelves)||!Array.isArray(result.addedToShelves)||typeof result.total!=='number'||!(result.nextCursor===null||typeof result.nextCursor==='string'))throw Error('Invalid shelf catalog');return result;},
  getNextPageParam:page=>page.nextCursor??undefined});
 const first=query.data?.pages[0];return{...query,data:first?{...first,shelves:[...new Map(query.data!.pages.flatMap(page=>page.shelves).map(shelf=>[shelf.id,shelf])).values()],addedToShelves:[...new Set(query.data!.pages.flatMap(page=>page.addedToShelves))]}:undefined};
}
export function useShelf(id:string){
 const owner=useAuthStore(state=>state.user?.id);
 return useInfiniteQuery({queryKey:['shelf',id,owner],initialPageParam:undefined as string|undefined,enabled:!!id&&!!owner,
  queryFn:async({pageParam,signal})=>{const result=await api.get<ShelfDetailPage>(ENDPOINTS.shelves.byId(id),{cursor:pageParam},signal);if(useAuthStore.getState().user?.id!==owner||result.actorId!==owner||result.shelfId!==id||result.shelf?.id!==id||!Array.isArray(result.books)||typeof result.total!=='number'||!(result.nextCursor===null||typeof result.nextCursor==='string'))throw Error('Invalid shelf page');return result;},getNextPageParam:page=>page.nextCursor??undefined});
}

export function useCreateShelf(){
 const qc=useQueryClient(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner),scope='shelf.create';
 function valid(value:unknown):value is {shelf:ShelfRow;actorId:string}{const result=value as {actorId?:string;shelf?:ShelfRow}|null;return result?.actorId===owner&&result?.shelf?.user_id===owner&&typeof result?.shelf?.id==='string'&&useAuthStore.getState().user?.id===owner;}
 async function acknowledge(value:unknown,key:string){if(!valid(value))throw Error('Invalid shelf receipt');await intent.complete(scope,key);if(useAuthStore.getState().user?.id===owner)void qc.invalidateQueries({queryKey:['shelves']});return value;}
 async function recover(key:string){const result=await api.get<unknown>(ENDPOINTS.shelves.list,{receipt:key});if(!valid(result))throw Error('Invalid shelf receipt');return result;}
 const mutation=useMutation({mutationFn:async(body:{name:string;description?:string;is_public?:boolean})=>{
  const payload={name:body.name.trim(),...(body.description?.trim()?{description:body.description.trim()}:{}),is_public:body.is_public??true},headers=await intent.durableHeaders(payload,scope);let result;
  try{result=await api.post<unknown>(ENDPOINTS.shelves.create,payload,headers);if(!valid(result))throw Error('Invalid shelf receipt');}catch{result=await recover(headers['Idempotency-Key']);}
  return acknowledge(result,headers['Idempotency-Key']);
 }});
 return{...mutation,recoverPending:async()=>{const headers=await intent.pending(scope);if(!headers)return null;try{return await acknowledge(await recover(headers['Idempotency-Key']),headers['Idempotency-Key']);}catch(error){if((error as {status?:number}).status===404)return null;throw error;}}};
}

export function useUpdateProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      shelfBookId,
      progress_pages,
      progress_percent,
    }: {
      shelfBookId: string;
      progress_pages?: number;
      progress_percent?: number;
    }) =>
      api.patch(ENDPOINTS.shelfBooks.progress(shelfBookId), { progress_pages, progress_percent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shelf'] }),
  });
}

import {useRequestIntent} from '@/hooks/useRequestIntent';
import {useAuthStore} from '@/stores/auth';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import type { ShelfRow, ShelfBookRow } from '@/types';

export function useShelves(bookId?:string,enabled=true) {
  return useQuery({
    queryKey: ['shelves',bookId],
    enabled,
    queryFn: () => api.get<{ shelves: ShelfRow[];addedToShelves:string[] }>(ENDPOINTS.shelves.list,{bookId}),
  });
}

export function useShelf(id:string){
  return useInfiniteQuery({
    queryKey:['shelf',id],
    initialPageParam:undefined as string|undefined,
    queryFn:({pageParam})=>api.get<{shelf:ShelfRow;books:ShelfBookRow[];nextCursor:string|null}>(ENDPOINTS.shelves.byId(id),{cursor:pageParam}),
    getNextPageParam:last=>last.nextCursor??undefined,
    enabled:!!id,
  });
}

export function useCreateShelf(){
  const qc=useQueryClient(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner);
  return useMutation({mutationFn:async(body:{name:string;description?:string;is_public?:boolean})=>{
    const payload={name:body.name.trim(),...(body.description?.trim()?{description:body.description.trim()}:{}),is_public:body.is_public??true},result=await api.post<{shelf:ShelfRow}>(ENDPOINTS.shelves.create,payload,await intent.durableHeaders(payload,'shelf.create'));
    if(!result.shelf?.id||result.shelf.user_id!==owner)throw Error('Invalid shelf receipt');await intent.complete('shelf.create');return result;
  },onSuccess:()=>{if(useAuthStore.getState().user?.id===owner)void qc.invalidateQueries({queryKey:['shelves']});}});
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

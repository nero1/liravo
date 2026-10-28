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

export function useCreateShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; is_public?: boolean }) =>
      api.post<{ shelf: ShelfRow }>(ENDPOINTS.shelves.create, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shelves'] }),
  });
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

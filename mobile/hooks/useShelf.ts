import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import type { ShelfRow, ShelfBookRow } from '@/types';

export function useShelves() {
  return useQuery({
    queryKey: ['shelves'],
    queryFn: () => api.get<{ shelves: ShelfRow[] }>(ENDPOINTS.shelves.list),
  });
}

export function useShelf(id: string) {
  return useQuery({
    queryKey: ['shelf', id],
    queryFn: () => api.get<{ shelf: ShelfRow; books: ShelfBookRow[] }>(ENDPOINTS.shelves.byId(id)),
    enabled: !!id,
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
      api.put(ENDPOINTS.shelfBooks.progress(shelfBookId), { progress_pages, progress_percent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shelf'] }),
  });
}

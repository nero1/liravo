import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import {useAuthStore} from '@/stores/auth';
import type { FeedItem } from '@/types';

interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

export function useFeed() {
  const owner=useAuthStore(state=>state.user?.id);
  return useInfiniteQuery({
    queryKey: ['feed',owner],
    enabled:!!owner,
    queryFn: ({ pageParam }) =>
      api.get<FeedPage>(ENDPOINTS.feed, {
        cursor: pageParam as string | undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

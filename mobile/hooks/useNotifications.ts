import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import {useAuthStore} from '@/stores/auth';
import type { NotificationRow } from '@/types';

interface NotificationsPage {
  notifications: NotificationRow[];
  nextCursor: string | null;
  actorId:string;
}

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam,signal }) =>
      api.get<NotificationsPage>(ENDPOINTS.notifications, {
        cursor: pageParam as string | undefined,
        limit: 50,
      },signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient(),owner=useAuthStore(state=>state.user?.id);
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<{ok:boolean}>(ENDPOINTS.notifications,{is_read:true,notification_id:id},{'X-Liravo-Actor':owner??''}).then(result=>{if(result.ok!==true)throw new Error('Invalid notification receipt');return result;}),
    onSuccess:()=>{if(useAuthStore.getState().user?.id===owner)void qc.invalidateQueries({queryKey:['notifications']});},
  });
}

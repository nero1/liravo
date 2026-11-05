import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
export function useAuthProviders(){return useQuery({queryKey:['auth-providers'],staleTime:0,queryFn:async({signal})=>{const data=await api.get<{google:boolean;telegram:boolean}>('/api/auth/providers',undefined,signal);if(typeof data.google!=='boolean'||typeof data.telegram!=='boolean')throw Error('Authentication providers unavailable');return data;}});}

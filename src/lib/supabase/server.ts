import { AuthError } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { providerFactorAuthorized } from '@/lib/auth/second-factor';
import type { Database } from '@/types/database';
import { isDirectPostgres } from '@/lib/db/provider';
import { createDoClient, createDoServiceClient } from '@/lib/db/unified-client';

export function createClient(options?:{skipMfa?:boolean}): ReturnType<typeof createServerClient<Database>> {
  if (isDirectPostgres()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createDoClient() as any;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  const cookieStore = cookies();
  const authorization=headers().get('authorization');
  const bearer=authorization?.startsWith('Bearer ')?authorization.slice(7):undefined;
  const client=createServerClient<Database, 'public'>(
    supabaseUrl,
    supabaseAnonKey,
    {
      global:{headers:bearer?{Authorization:`Bearer ${bearer}`}:{ }},
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server component — cookie setting ignored
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Server component — cookie removal ignored
          }
        },
      },
    }
  );
  if(!options?.skipMfa){
    const getUser=client.auth.getUser.bind(client.auth);
    client.auth.getUser=async(token?:string)=>{
      const result=await getUser(token??bearer);
      if(!result.data.user)return result;
      const accessToken=token??bearer??(await client.auth.getSession()).data.session?.access_token;
      if(!await providerFactorAuthorized(result.data.user.id,accessToken))return {data:{user:null},error:new AuthError('Second factor required')};
      return result;
    };
  }
  return client;
}

export function createServiceClient(): ReturnType<typeof createServerClient<Database>> {
  if (isDirectPostgres()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createDoServiceClient() as any;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createServerClient<Database, 'public'>(
    supabaseUrl,
    serviceRoleKey,
    {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    }
  );
}

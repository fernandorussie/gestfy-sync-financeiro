import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { urlDoSupabase } from "./url";

/** Cliente SSR — usa cookies do request, respeita permissões do anon key. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    urlDoSupabase(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies só podem ser modificados em Route Handlers ou Server Actions
          }
        },
      },
    }
  );
}

/** Cliente admin — usa SERVICE_ROLE_KEY. Nunca expor no browser.
 *  Não precisa de cookies; use apenas em Route Handlers e Server Actions. */
export function getSupabaseAdmin() {
  return createSupabaseClient<Database>(
    urlDoSupabase(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

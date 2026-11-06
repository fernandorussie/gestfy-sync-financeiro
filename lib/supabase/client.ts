import { createBrowserClient } from "@supabase/ssr";
import { urlDoSupabase } from "./url";

export function createClient() {
  return createBrowserClient(
    urlDoSupabase(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

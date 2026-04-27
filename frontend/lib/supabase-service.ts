import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Server-only: Supabase client with the service role key. Never import from client components. */
export function createServiceClient(): SupabaseClient {
  if (cached) {
    return cached;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}

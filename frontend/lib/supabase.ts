import { createClient } from "@supabase/supabase-js";

// Transitional fallback: frontend is migrating to Railway backend APIs.
// Keep client creation non-throwing so pages not yet migrated do not crash at import time.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Second client for teacher-driven student signUp: must use a distinct auth storageKey so it does not clash with the main session. */
export const supabaseIsolated = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "sb-agile-fju-handup-teacher-signup",
  },
});

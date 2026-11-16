import type { Database } from "@lamarkerja/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type WorkerSupabase = SupabaseClient<Database>;

/**
 * Client Supabase dengan secret key (bypass RLS). Worker tidak menyimpan sesi
 * pengguna, jadi auto-refresh dan persistensi sesi dimatikan.
 */
export function createWorkerSupabase(url: string, secretKey: string): WorkerSupabase {
  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "User-Agent": "lamarkerja-worker" },
    },
  });
}

import "server-only";

import type { Database } from "@lamarkerja/db";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * Client Supabase yang membaca session dari cookie (user-scoped).
 * Semua query tunduk pada RLS milik user yang sedang login.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Dipanggil dari Server Component: middleware yang menyegarkan session.
        }
      },
    },
  });
}

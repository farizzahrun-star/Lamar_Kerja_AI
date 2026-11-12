import "server-only";

import type { Database } from "@lamarkerja/db";
import { createAdminClient } from "@supabase/server/core";

/**
 * Client Supabase dengan secret key (bypass RLS).
 * Hanya untuk Route Handlers / Server Actions / worker. Jangan pernah
 * diimpor dari komponen client.
 */
export function createAdminSupabase() {
  return createAdminClient<Database>();
}

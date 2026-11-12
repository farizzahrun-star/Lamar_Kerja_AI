import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Menangani tautan konfirmasi email / OAuth Supabase.
 * Alur utama memakai admin createUser (langsung aktif), tetapi callback tetap
 * disediakan untuk pemakaian berikutnya.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const redirectUrl = new URL(next.startsWith("/") ? next : "/dashboard", url.origin);
  return NextResponse.redirect(redirectUrl);
}

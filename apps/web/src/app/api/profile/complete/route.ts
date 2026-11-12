import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, unauthorized } from "@/lib/api";
import { ensureProfile } from "@/lib/profile-data";

/**
 * Menandai onboarding selesai. Dipakai tombol "Selesai" di langkah terakhir
 * wizard; boleh dipanggil ulang tanpa efek samping.
 */
export async function POST() {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  try {
    await ensureProfile(supabase, user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("user_id, onboarding_step, onboarding_completed_at")
      .single();

    if (error) return dbErrorResponse(error);
    return NextResponse.json({ data });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

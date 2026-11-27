import { updatePreferencesSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, parseBody, unauthorized } from "@/lib/api";
import { recordAuditLog } from "@/lib/consent";
import { loadUserPreferences } from "@/lib/preferences/data";

export async function GET() {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  try {
    const bundle = await loadUserPreferences(supabase, user.id);
    return NextResponse.json({ data: bundle });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

export async function PUT(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, updatePreferencesSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await loadUserPreferences(supabase, user.id);
    const { interestIds, platforms, settings } = parsed.data;

    if (interestIds !== undefined) {
      const uniqueIds = [...new Set(interestIds)];
      const { error: deleteError } = await supabase
        .from("user_interests")
        .delete()
        .eq("user_id", user.id);
      if (deleteError) return dbErrorResponse(deleteError);

      if (uniqueIds.length > 0) {
        const { error: insertError } = await supabase.from("user_interests").insert(
          uniqueIds.map((interestId) => ({
            user_id: user.id,
            interest_id: interestId,
          })),
        );
        if (insertError) return dbErrorResponse(insertError);
      }
    }

    if (platforms !== undefined && platforms.length > 0) {
      const { error: platformError } = await supabase.from("user_platforms").upsert(
        platforms.map((item) => ({
          user_id: user.id,
          platform: item.platform,
          enabled: item.enabled,
        })),
        { onConflict: "user_id,platform" },
      );
      if (platformError) return dbErrorResponse(platformError);
    }

    if (settings !== undefined && Object.keys(settings).length > 0) {
      const { error: settingsError } = await supabase
        .from("user_settings")
        .update(settings)
        .eq("user_id", user.id);
      if (settingsError) return dbErrorResponse(settingsError);
    }

    await recordAuditLog({
      actorId: user.id,
      action: "preferences.updated",
      entity: "user_settings",
      entityId: user.id,
      meta: {
        interestsCount: interestIds?.length,
        platformsUpdated: platforms?.length,
        hasSettingsUpdate: Boolean(settings && Object.keys(settings).length > 0),
      },
    });

    const updated = await loadUserPreferences(supabase, user.id);
    return NextResponse.json({ data: updated });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

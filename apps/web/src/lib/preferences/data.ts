import "server-only";

import {
  ACTIVE_SCRAPE_PLATFORMS,
  DEFAULT_APPLY_DAILY_LIMIT,
  type ActiveScrapePlatform,
} from "@lamarkerja/shared";

import { env } from "@/lib/env";
import type { PreferencesBundle } from "@/lib/phase2-types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function ensureUserPreferences(
  supabase: Client,
  userId: string,
): Promise<{
  apply_daily_limit: number;
  review_before_send: boolean;
  portal_auto_submit: boolean;
}> {
  const { data: existingSettings, error: settingsReadError } = await supabase
    .from("user_settings")
    .select("apply_daily_limit, review_before_send, portal_auto_submit")
    .eq("user_id", userId)
    .maybeSingle();

  if (settingsReadError) throw settingsReadError;

  let settings = existingSettings;
  if (!settings) {
    const { data: created, error: insertError } = await supabase
      .from("user_settings")
      .upsert(
        {
          user_id: userId,
          apply_daily_limit: env.APPLY_DAILY_LIMIT_PER_USER ?? DEFAULT_APPLY_DAILY_LIMIT,
          review_before_send: true,
          portal_auto_submit: false,
        },
        { onConflict: "user_id" },
      )
      .select("apply_daily_limit, review_before_send, portal_auto_submit")
      .single();

    if (insertError) throw insertError;
    settings = created;
  }

  const { data: existingPlatforms, error: platformsReadError } = await supabase
    .from("user_platforms")
    .select("platform")
    .eq("user_id", userId);

  if (platformsReadError) throw platformsReadError;

  const existingSet = new Set((existingPlatforms ?? []).map((row) => row.platform));
  const missingPlatforms = ACTIVE_SCRAPE_PLATFORMS.filter((platform) => !existingSet.has(platform));

  if (missingPlatforms.length > 0) {
    const { error: upsertPlatformsError } = await supabase.from("user_platforms").upsert(
      missingPlatforms.map((platform) => ({
        user_id: userId,
        platform,
        enabled: true,
        session_status: "none" as const,
      })),
      { onConflict: "user_id,platform", ignoreDuplicates: true },
    );

    if (upsertPlatformsError) throw upsertPlatformsError;
  }

  return settings;
}

export async function loadUserPreferences(
  supabase: Client,
  userId: string,
): Promise<PreferencesBundle> {
  const settings = await ensureUserPreferences(supabase, userId);

  const [interestsRes, selectedRes, platformsRes] = await Promise.all([
    supabase
      .from("interests")
      .select("id, slug, label, is_default, created_at")
      .order("is_default", { ascending: false })
      .order("label", { ascending: true }),
    supabase.from("user_interests").select("interest_id").eq("user_id", userId),
    supabase
      .from("user_platforms")
      .select("platform, enabled, session_status, last_checked_at")
      .eq("user_id", userId),
  ]);

  for (const res of [interestsRes, selectedRes, platformsRes]) {
    if (res.error) throw res.error;
  }

  const platformMap = new Map(
    (platformsRes.data ?? []).map((row) => [row.platform as ActiveScrapePlatform, row]),
  );

  const platforms = ACTIVE_SCRAPE_PLATFORMS.map((platform) => {
    const row = platformMap.get(platform);
    return {
      platform,
      enabled: row?.enabled ?? true,
      session_status: row?.session_status ?? ("none" as const),
      last_checked_at: row?.last_checked_at ?? null,
    };
  });

  return {
    interests: interestsRes.data ?? [],
    selectedInterestIds: (selectedRes.data ?? []).map((row) => row.interest_id),
    platforms,
    settings,
  };
}

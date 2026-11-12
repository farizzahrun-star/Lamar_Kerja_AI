import "server-only";

import type { ProfileBundle, ProfileRow } from "@/lib/profile-types";
import { createClient } from "@/lib/supabase/server";

export type {
  CertificationRow,
  EducationRow,
  ExperiencePointRow,
  ExperienceRow,
  LanguageRow,
  ProfileBundle,
  ProfileRow,
  SkillRow,
} from "@/lib/profile-types";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function ensureProfile(supabase: Client, userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (createError) throw createError;
  return created;
}

export async function loadProfileBundle(
  supabase: Client,
  userId: string,
): Promise<ProfileBundle> {
  const profile = await ensureProfile(supabase, userId);

  const [educations, experiences, skills, certifications, languages] = await Promise.all([
    supabase
      .from("educations")
      .select("*")
      .eq("profile_id", userId)
      .order("start_year", { ascending: false, nullsFirst: false }),
    supabase
      .from("experiences")
      .select("*, experience_points(id, content, sort_order)")
      .eq("profile_id", userId)
      .order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("skills").select("*").eq("profile_id", userId).order("name"),
    supabase
      .from("certifications")
      .select("*")
      .eq("profile_id", userId)
      .order("year", { ascending: false, nullsFirst: false }),
    supabase.from("languages").select("*").eq("profile_id", userId).order("name"),
  ]);

  for (const result of [educations, experiences, skills, certifications, languages]) {
    if (result.error) throw result.error;
  }

  const experienceRows = (experiences.data ?? []).map((row) => {
    const { experience_points, ...experience } = row;
    return {
      ...experience,
      points: [...(experience_points ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    };
  });

  return {
    profile,
    educations: educations.data ?? [],
    experiences: experienceRows,
    skills: skills.data ?? [],
    certifications: certifications.data ?? [],
    languages: languages.data ?? [],
  };
}

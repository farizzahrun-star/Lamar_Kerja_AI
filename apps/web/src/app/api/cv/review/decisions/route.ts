import { NextResponse } from "next/server";
import { z } from "zod";

import { dbErrorResponse, getApiContext, parseBody, unauthorized } from "@/lib/api";
import { recordAuditLog } from "@/lib/consent";
import {
  acceptedSuggestionIds,
  invalidSuggestionIds,
  planMerges,
  type MergeSuggestionInput,
} from "@/lib/cv/merge";
import { logEvent } from "@/lib/log";
import { loadProfileBundle } from "@/lib/profile-data";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Menerima atau menolak saran hasil parsing CV.
 *
 * - `accept`: saran yang valid digabungkan ke profil (identitas di-patch,
 *   pengalaman/pendidikan/skill di-insert dengan dedupe). Saran duplikat tetap
 *   ditandai `accepted` karena keputusan user sudah dicatat, tetapi tidak
 *   menulis data baru.
 * - `reject`: saran hanya ditandai `rejected`, tidak menyentuh profil.
 *
 * Tidak ada jalur yang menulis profil tanpa aksi eksplisit user.
 */
const decisionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["accept", "reject"]),
});

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, decisionSchema);
  if (!parsed.ok) return parsed.response;

  const { action } = parsed.data;
  const ids = [...new Set(parsed.data.ids)];

  const { data: rows, error: selectError } = await supabase
    .from("cv_parse_suggestions")
    .select("id, section, field_path, value_json")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .in("id", ids);

  if (selectError) return dbErrorResponse(selectError);

  const pendingRows = rows ?? [];
  if (pendingRows.length === 0) {
    return NextResponse.json({
      data: {
        action,
        requested: ids.length,
        decided: 0,
        applied: 0,
        duplicates: 0,
        invalid: 0,
        skipped: ids.length,
        decided_ids: [],
        decisions: [],
      },
    });
  }

  const nowIso = new Date().toISOString();
  const admin = createAdminSupabase();

  if (action === "reject") {
    const decidedIds = pendingRows.map((row) => row.id);

    const { error: updateError } = await admin
      .from("cv_parse_suggestions")
      .update({ status: "rejected", decided_at: nowIso })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .in("id", decidedIds);

    if (updateError) return dbErrorResponse(updateError);

    await recordAuditLog({
      actorId: user.id,
      action: "cv.suggestion.rejected",
      entity: "cv_parse_suggestions",
      meta: { count: decidedIds.length, ids: decidedIds },
    });

    logEvent("info", "cv.review.rejected", {
      userId: user.id,
      count: decidedIds.length,
    });

    return NextResponse.json({
      data: {
        action,
        requested: ids.length,
        decided: decidedIds.length,
        applied: 0,
        duplicates: 0,
        invalid: 0,
        skipped: ids.length - decidedIds.length,
        decided_ids: decidedIds,
        decisions: [],
      },
    });
  }

  const bundle = await loadProfileBundle(supabase, user.id);
  const plan = planMerges(
    bundle,
    pendingRows.map(
      (row): MergeSuggestionInput => ({
        id: row.id,
        section: row.section,
        field_path: row.field_path,
        value_json: row.value_json,
      }),
    ),
  );

  // 1. Identitas: satu patch atomik ke `profiles`.
  if (plan.identity.fields.length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update(plan.identity.patch as never)
      .eq("user_id", user.id);

    if (error) return dbErrorResponse(error);
  }

  // 2. Pendidikan: insert batch.
  if (plan.educations.length > 0) {
    const { error } = await supabase.from("educations").insert(
      plan.educations.map((entry) => ({
        ...entry.values,
        profile_id: user.id,
      })),
    );

    if (error) return dbErrorResponse(error);
  }

  // 3. Skill: insert batch.
  if (plan.skills.length > 0) {
    const { error } = await supabase.from("skills").insert(
      plan.skills.map((entry) => ({
        name: entry.values.name,
        level: entry.values.level,
        years: entry.values.years,
        profile_id: user.id,
      })),
    );

    if (error) return dbErrorResponse(error);
  }

  // 4. Pengalaman: insert per entri karena butuh id untuk `experience_points`.
  for (const entry of plan.experiences) {
    const { points, ...fields } = entry.values;

    const { data: inserted, error } = await supabase
      .from("experiences")
      .insert({ ...fields, profile_id: user.id })
      .select("id")
      .single();

    if (error) return dbErrorResponse(error);

    if (points.length > 0) {
      const { error: pointError } = await supabase.from("experience_points").insert(
        points.map((content, index) => ({
          experience_id: inserted.id,
          content,
          sort_order: index,
        })),
      );

      if (pointError) return dbErrorResponse(pointError);
    }
  }

  const acceptedIds = acceptedSuggestionIds(plan);
  const rejectedIds = invalidSuggestionIds(plan);

  if (acceptedIds.length > 0) {
    const { error } = await admin
      .from("cv_parse_suggestions")
      .update({ status: "accepted", decided_at: nowIso })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .in("id", acceptedIds);

    if (error) return dbErrorResponse(error);
  }

  if (rejectedIds.length > 0) {
    const { error } = await admin
      .from("cv_parse_suggestions")
      .update({ status: "rejected", decided_at: nowIso })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .in("id", rejectedIds);

    if (error) return dbErrorResponse(error);
  }

  const applied = plan.decisions.filter((d) => d.disposition === "applied").length;
  const duplicates = plan.decisions.filter((d) => d.disposition === "duplicate").length;
  const invalid = rejectedIds.length;

  await recordAuditLog({
    actorId: user.id,
    action: "cv.suggestion.accepted",
    entity: "cv_parse_suggestions",
    meta: {
      count: acceptedIds.length + rejectedIds.length,
      applied,
      duplicates,
      invalid,
      identityFields: plan.identity.fields,
      experiences: plan.experiences.length,
      educations: plan.educations.length,
      skills: plan.skills.length,
    },
  });

  logEvent("info", "cv.review.accepted", {
    userId: user.id,
    applied,
    duplicates,
    invalid,
  });

  return NextResponse.json({
    data: {
      action,
      requested: ids.length,
      decided: acceptedIds.length + rejectedIds.length,
      applied,
      duplicates,
      invalid,
      skipped: ids.length - acceptedIds.length - rejectedIds.length,
      decided_ids: [...acceptedIds, ...rejectedIds],
      decisions: plan.decisions,
    },
  });
}

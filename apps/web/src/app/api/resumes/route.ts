import type { Database } from "@lamarkerja/db";
import { createResumeSchema } from "@lamarkerja/shared";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  dbErrorResponse,
  getApiContext,
  jsonError,
  parseBody,
  unauthorized,
} from "@/lib/api";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { loadProfileBundle, loadUserResumes } from "@/lib/profile-data";
import { buildResumeSnapshot, renderResumePdf } from "@/lib/resume/render";
import { removeResumeFileQuietly, writeResumeFile } from "@/lib/resume/storage";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  try {
    const items = await loadUserResumes(supabase, user.id);
    return NextResponse.json({ data: items });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, createResumeSchema);
  if (!parsed.ok) return parsed.response;

  const { template } = parsed.data;

  let bundle;
  try {
    bundle = await loadProfileBundle(supabase, user.id);
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }

  const snapshot = buildResumeSnapshot(bundle, user.email ?? null);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderResumePdf(snapshot, template);
  } catch {
    logEvent("error", "resume.render_failed", { userId: user.id, template });
    return jsonError(500, "RENDER_FAILED", "Gagal merender PDF CV.");
  }

  const resumeId = randomUUID();
  let written: { relativePath: string; absolutePath: string };
  try {
    written = await writeResumeFile(env.RESUME_STORAGE_DIR, user.id, resumeId, pdfBuffer);
  } catch {
    logEvent("error", "resume.write_failed", { userId: user.id });
    return jsonError(500, "STORAGE_ERROR", "Gagal menyimpan file PDF.");
  }

  const admin = createAdminSupabase();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: latest, error: latestError } = await admin
      .from("resumes")
      .select("version")
      .eq("user_id", user.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      await removeResumeFileQuietly(written.absolutePath);
      return dbErrorResponse(latestError);
    }

    const nextVersion = (latest?.version ?? 0) + 1;

    const { data: inserted, error: insertError } = await admin
      .from("resumes")
      .insert({
        id: resumeId,
        user_id: user.id,
        version: nextVersion,
        template,
        pdf_path: written.relativePath,
        data_json:
          snapshot as unknown as Database["public"]["Tables"]["resumes"]["Insert"]["data_json"],
      })
      .select("id, version, template, created_at, application_id")
      .single();

    if (!insertError && inserted) {
      logEvent("info", "resume.created", {
        userId: user.id,
        resumeId: inserted.id,
        version: inserted.version,
        template: inserted.template,
      });
      return NextResponse.json({ data: inserted }, { status: 201 });
    }

    if (insertError?.code !== "23505" || attempt === 1) {
      await removeResumeFileQuietly(written.absolutePath);
      return dbErrorResponse(insertError ?? { code: "unknown" });
    }
  }

  await removeResumeFileQuietly(written.absolutePath);
  return jsonError(500, "DB_ERROR", "Gagal menyimpan metadata CV.");
}

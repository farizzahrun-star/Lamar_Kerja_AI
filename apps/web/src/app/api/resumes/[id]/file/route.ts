import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, notFound, parseUuid, unauthorized } from "@/lib/api";
import { env } from "@/lib/env";
import { readResumeFile } from "@/lib/resume/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { id } = await params;
  const resumeId = parseUuid(id);
  if (!resumeId) return notFound();

  const { data: resume, error } = await supabase
    .from("resumes")
    .select("id, user_id, version, template, pdf_path")
    .eq("id", resumeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return dbErrorResponse(error);
  if (!resume) return notFound();

  const pdfBuffer = await readResumeFile(env.RESUME_STORAGE_DIR, user.id, resume.pdf_path);
  if (!pdfBuffer) return notFound();

  const url = new URL(request.url);
  const isAttachment =
    url.searchParams.get("download") === "1" ||
    url.searchParams.get("disposition") === "attachment";

  const filename = `cv-v${resume.version}-template-${resume.template}.pdf`;
  const disposition = `${isAttachment ? "attachment" : "inline"}; filename="${filename}"`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdfBuffer.byteLength),
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}

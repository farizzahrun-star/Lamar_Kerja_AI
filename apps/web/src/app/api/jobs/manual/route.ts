import { manualJobInputSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, parseBody, unauthorized } from "@/lib/api";
import { ingestManualJobs } from "@/lib/jobs/ingest";

export async function POST(request: Request) {
  const { user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, manualJobInputSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const input = parsed.data;
    const result = await ingestManualJobs({
      actorId: user.id,
      mode: input.mode,
      jobs: [
        {
          title: input.title,
          company: input.company,
          location: input.location,
          work_mode: input.work_mode,
          salary_min: input.salary_min,
          salary_max: input.salary_max,
          description: input.description,
          url: input.url,
          posted_at: input.posted_at,
          hr_email: input.hr_email,
          platform: input.mode === "url" ? input.platform : "manual",
        },
      ],
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

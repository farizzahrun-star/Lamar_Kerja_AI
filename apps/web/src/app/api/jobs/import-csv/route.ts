import { csvImportPayloadSchema, parseJobsCsv } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, jsonError, parseBody, unauthorized } from "@/lib/api";
import { ingestManualJobs } from "@/lib/jobs/ingest";

export async function POST(request: Request) {
  const { user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, csvImportPayloadSchema);
  if (!parsed.ok) return parsed.response;

  const csvResult = parseJobsCsv(parsed.data.csv);
  if (csvResult.rows.length === 0) {
    return jsonError(
      400,
      "CSV_INVALID",
      csvResult.errors[0]?.message ?? "Tidak ada baris CSV valid yang dapat diimpor.",
    );
  }

  try {
    const ingested = await ingestManualJobs({
      actorId: user.id,
      mode: "csv",
      jobs: csvResult.rows,
    });

    return NextResponse.json(
      {
        data: {
          ...ingested,
          skipped: csvResult.errors.length,
          errors: csvResult.errors,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

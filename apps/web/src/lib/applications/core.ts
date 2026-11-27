import { MAX_APPLY_DAILY_LIMIT, type ApplicationStatus } from "@lamarkerja/shared";

export interface ExistingApplicationSnapshot {
  job_id: string;
  status: ApplicationStatus;
}

export type QueueValidationResult =
  | { ok: true; uniqueJobIds: string[] }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      conflictingJobIds?: string[];
    };

export function canCancelApplication(status: ApplicationStatus): boolean {
  return status === "queued";
}

export function evaluateQueueRequest(params: {
  requestedJobIds: string[];
  existingApplications: ExistingApplicationSnapshot[];
  todayCount: number;
  dailyLimit: number;
}): QueueValidationResult {
  const uniqueJobIds = [...new Set(params.requestedJobIds)];
  if (uniqueJobIds.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "EMPTY_SELECTION",
      message: "Pilih minimal satu lowongan untuk diantrekan.",
    };
  }

  const normalizedLimit = Math.max(1, Math.min(MAX_APPLY_DAILY_LIMIT, params.dailyLimit));
  const activeExisting = new Set(
    params.existingApplications
      .filter((item) => item.status !== "cancelled")
      .map((item) => item.job_id),
  );

  const conflictingJobIds = uniqueJobIds.filter((jobId) => activeExisting.has(jobId));
  if (conflictingJobIds.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "ALREADY_APPLIED",
      message:
        conflictingJobIds.length === 1
          ? "Lowongan ini sudah ada di antrean atau pernah dilamar."
          : `${conflictingJobIds.length} lowongan yang dipilih sudah ada di antrean atau pernah dilamar.`,
      conflictingJobIds,
    };
  }

  const remaining = Math.max(0, normalizedLimit - params.todayCount);
  if (uniqueJobIds.length > remaining) {
    return {
      ok: false,
      status: 429,
      code: "DAILY_LIMIT_REACHED",
      message:
        remaining === 0
          ? `Kuota antrean harian (${normalizedLimit}/hari) sudah tercapai.`
          : `Permintaan (${uniqueJobIds.length} lowongan) melebihi sisa kuota hari ini (${remaining} dari ${normalizedLimit}).`,
    };
  }

  return { ok: true, uniqueJobIds };
}

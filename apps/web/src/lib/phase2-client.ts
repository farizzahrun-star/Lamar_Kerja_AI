import type {
  ApplyChannel,
  JobPlatform,
  ManualJobInput,
  UpdatePreferencesInput,
  WorkMode,
} from "@lamarkerja/shared";

import type {
  ApplicationsOverview,
  CsvImportResponse,
  InterestRow,
  JobsFeedResponse,
  JobSourceRow,
  ManualIngestResult,
  PreferencesBundle,
  RunnerTokenItem,
} from "@/lib/phase2-types";
import type { ApiResult } from "@/lib/profile-client";
import type { ApiErrorBody } from "@/lib/profile-types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi server." };
  }

  const body = (await response.json().catch(() => null)) as
    | { data?: T }
    | ApiErrorBody
    | null;

  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    return {
      ok: false,
      code: error?.code,
      message: error?.message ?? "Terjadi kesalahan.",
      fields: error?.fields,
    };
  }

  return { ok: true, data: (body as { data?: T } | null)?.data as T };
}

export function savePreferences(payload: UpdatePreferencesInput) {
  return requestJson<PreferencesBundle>("/api/preferences", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function createCustomInterest(label: string) {
  return requestJson<InterestRow>("/api/preferences/interests", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function fetchJobsFeed(params: {
  snapshot?: "h1" | "today" | "all";
  showAll?: boolean;
  platform?: JobPlatform | "all";
  workMode?: WorkMode | "all";
  channel?: ApplyChannel | "all";
  query?: string;
}) {
  const search = new URLSearchParams();
  if (params.snapshot) search.set("snapshot", params.snapshot);
  if (params.showAll) search.set("showAll", "true");
  if (params.platform && params.platform !== "all") search.set("platform", params.platform);
  if (params.workMode && params.workMode !== "all") search.set("workMode", params.workMode);
  if (params.channel && params.channel !== "all") search.set("channel", params.channel);
  if (params.query?.trim()) search.set("q", params.query.trim());

  const qs = search.toString();
  return requestJson<JobsFeedResponse>(qs ? `/api/jobs?${qs}` : "/api/jobs");
}

export function submitManualJob(payload: ManualJobInput) {
  return requestJson<ManualIngestResult>("/api/jobs/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function importJobsCsv(csvText: string) {
  return requestJson<CsvImportResponse>("/api/jobs/import-csv", {
    method: "POST",
    body: JSON.stringify({ csv: csvText }),
  });
}

export function fetchApplicationsOverview() {
  return requestJson<ApplicationsOverview>("/api/applications");
}

export function queueApplications(jobIds: string[]) {
  return requestJson<{
    created: Array<{ id: string; job_id: string; channel: ApplyChannel; status: "queued" }>;
    quota: { used: number; limit: number; remaining: number; dateWib: string };
  }>("/api/applications", {
    method: "POST",
    body: JSON.stringify({ jobIds }),
  });
}

export function cancelApplication(applicationId: string) {
  return requestJson<{ id: string; status: "cancelled"; cancelled_at: string }>(
    `/api/applications/${encodeURIComponent(applicationId)}/cancel`,
    { method: "POST" },
  );
}

export function createRunnerToken(name: string) {
  return requestJson<{ runner: RunnerTokenItem; rawToken: string }>("/api/runners/tokens", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function revokeRunnerToken(runnerId: string) {
  return requestJson<RunnerTokenItem>(
    `/api/runners/tokens/${encodeURIComponent(runnerId)}`,
    { method: "DELETE" },
  );
}

export function toggleJobSource(sourceId: string, enabled: boolean) {
  return requestJson<JobSourceRow>(
    `/api/runners/sources/${encodeURIComponent(sourceId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
  );
}

import type {
  RunnerJobsSubmission,
  RunnerTaskResultInput,
  RunnerTasksResponsePayload,
} from "@lamarkerja/shared";

export interface RunnerApiClient {
  pullTasks(options?: { force?: boolean }): Promise<RunnerTasksResponsePayload>;
  submitJobs(payload: RunnerJobsSubmission): Promise<{ batchId: string; collectorRunId: string }>;
  reportTaskResult(taskId: string, payload: RunnerTaskResultInput): Promise<void>;
}

export function createRunnerApiClient(params: {
  serverUrl: string;
  runnerToken: string;
  fetchImpl?: typeof fetch;
}): RunnerApiClient {
  const fetchFn = params.fetchImpl ?? fetch;
  const baseUrl = params.serverUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${params.runnerToken}`,
        "Content-Type": "application/json",
        "User-Agent": "lamarkerja-runner",
        ...init?.headers,
      },
    });

    const json = (await response.json().catch(() => null)) as
      | { data?: T; error?: { code?: string; message?: string } }
      | null;

    if (!response.ok) {
      const msg = json?.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`Runner API error (${path}): ${msg}`);
    }

    return json?.data as T;
  }

  return {
    pullTasks(options) {
      const qs = options?.force ? "?force=1" : "";
      return request<RunnerTasksResponsePayload>(`/api/runner/tasks${qs}`);
    },
    submitJobs(payload) {
      return request<{ batchId: string; collectorRunId: string }>("/api/runner/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async reportTaskResult(taskId, payload) {
      await request(`/api/runner/tasks/${encodeURIComponent(taskId)}/result`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };
}

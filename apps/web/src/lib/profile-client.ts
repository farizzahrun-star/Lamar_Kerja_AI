import type { ResumeTemplate } from "@lamarkerja/shared";

import type { ApiErrorBody, ProfileBundle, ProfileRow, ResumeListItem } from "@/lib/profile-types";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fields?: Record<string, string> };

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
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
      message: error?.message ?? "Terjadi kesalahan.",
      fields: error?.fields,
    };
  }

  return { ok: true, data: (body as { data?: T } | null)?.data as T };
}

export function fetchProfileBundle() {
  return request<ProfileBundle>("/api/profile");
}

export function patchProfile(payload: Record<string, unknown>): Promise<ApiResult<ProfileRow>> {
  return request<ProfileRow>("/api/profile", { method: "PATCH", body: JSON.stringify(payload) });
}

export function completeOnboarding() {
  return request("/api/profile/complete", { method: "POST" });
}

export const RESOURCE_PATHS = {
  educations: "/api/profile/educations",
  experiences: "/api/profile/experiences",
  skills: "/api/profile/skills",
  certifications: "/api/profile/certifications",
  languages: "/api/profile/languages",
} as const;

export type ResourceName = keyof typeof RESOURCE_PATHS;

export function createEntry<T>(resource: ResourceName, payload: unknown) {
  return request<T>(RESOURCE_PATHS[resource], {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEntry<T>(resource: ResourceName, id: string, payload: unknown) {
  return request<T>(`${RESOURCE_PATHS[resource]}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEntry(resource: ResourceName, id: string) {
  return request<{ id: string }>(`${RESOURCE_PATHS[resource]}/${id}`, { method: "DELETE" });
}

export function fetchResumes() {
  return request<ResumeListItem[]>("/api/resumes");
}

export function createResume(template: ResumeTemplate) {
  return request<ResumeListItem>("/api/resumes", {
    method: "POST",
    body: JSON.stringify({ template }),
  });
}

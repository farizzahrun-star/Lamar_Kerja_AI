import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logEvent } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

export type ApiFieldErrors = Record<string, string>;

export function jsonError(
  status: number,
  code: string,
  message: string,
  fields?: ApiFieldErrors,
) {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status },
  );
}

export function zodErrorResponse(error: z.ZodError) {
  const fields: ApiFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return jsonError(400, "VALIDATION_ERROR", "Data tidak valid.", fields);
}

export async function getApiContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export function unauthorized() {
  return jsonError(401, "UNAUTHORIZED", "Sesi tidak valid. Silakan login ulang.");
}

export function notFound() {
  return jsonError(404, "NOT_FOUND", "Data tidak ditemukan.");
}

export function parseUuid(value: string): string | null {
  const parsed = z.string().uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

type ParseResult<S extends z.ZodType> =
  | { ok: true; data: z.output<S> }
  | { ok: false; response: NextResponse };

export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParseResult<S>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonError(400, "INVALID_JSON", "Body harus JSON yang valid."),
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, response: zodErrorResponse(parsed.error) };
  }

  return { ok: true, data: parsed.data as z.output<S> };
}

export function dbErrorResponse(error: { code?: string | null }) {
  if (error.code === "23505") {
    return jsonError(409, "DUPLICATE", "Data yang sama sudah ada.");
  }
  if (error.code === "23503") {
    return jsonError(400, "INVALID_REFERENCE", "Referensi data tidak valid.");
  }
  if (error.code === "23514") {
    return jsonError(400, "INVALID_VALUE", "Nilai tidak memenuhi aturan database.");
  }

  logEvent("error", "api.db_error", { code: error.code ?? "unknown" });
  return jsonError(500, "DB_ERROR", "Terjadi kesalahan pada database.");
}

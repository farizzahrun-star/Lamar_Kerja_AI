import "server-only";

import { createHash } from "node:crypto";
import type { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { logEvent } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface AuthenticatedRunner {
  id: string;
  user_id: string;
  name: string;
}

export type RunnerAuthResult =
  | { ok: true; runner: AuthenticatedRunner }
  | { ok: false; response: NextResponse };

export function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  const token = match?.[1]?.trim();
  return token && token.length >= 16 ? token : null;
}

export async function authenticateRunnerRequest(request: Request): Promise<RunnerAuthResult> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return {
      ok: false,
      response: jsonError(401, "RUNNER_UNAUTHORIZED", "Token runner tidak ditemukan."),
    };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminSupabase();

  const { data: runner, error } = await admin
    .from("runners")
    .select("id, user_id, name, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    logEvent("error", "runner.auth_db_error", { code: error.code ?? "unknown" });
    return {
      ok: false,
      response: jsonError(500, "DB_ERROR", "Gagal memverifikasi token runner."),
    };
  }

  if (!runner) {
    return {
      ok: false,
      response: jsonError(401, "RUNNER_UNAUTHORIZED", "Token runner tidak valid."),
    };
  }

  if (runner.revoked_at) {
    return {
      ok: false,
      response: jsonError(401, "RUNNER_TOKEN_REVOKED", "Token runner telah dicabut."),
    };
  }

  await admin
    .from("runners")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", runner.id);

  return {
    ok: true,
    runner: {
      id: runner.id,
      user_id: runner.user_id,
      name: runner.name,
    },
  };
}

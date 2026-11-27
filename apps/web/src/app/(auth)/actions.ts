"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  extractAuthFieldErrors,
  mapLoginAuthError,
  mapRegisterAuthError,
  type AuthState,
} from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { safeNextPath } from "@/lib/safe-redirect";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type { AuthState } from "@/lib/auth-errors";

const loginSchema = z.object({
  email: z.string().trim().email("Masukkan alamat email yang valid."),
  password: z.string().min(1, "Password wajib diisi."),
});

const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Nama lengkap minimal 2 karakter.")
    .max(120, "Nama lengkap maksimal 120 karakter."),
  email: z.string().trim().email("Masukkan alamat email yang valid."),
  password: z.string().min(8, "Password minimal 8 karakter."),
});

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const rawEmail = formData.get("email")?.toString().trim() ?? "";

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password")?.toString() ?? "",
  });

  if (!parsed.success) {
    const fieldErrors = extractAuthFieldErrors(parsed.error);
    return {
      error: "Periksa kembali email dan password Anda.",
      errorCode: "validation",
      fieldErrors,
      values: { email: rawEmail },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    logEvent("warn", "auth.login.failed", {
      code: error.code ?? "unknown",
      status: error.status ?? 0,
    });
    const mapped = mapLoginAuthError(error);
    return {
      ...mapped,
      values: { email: parsed.data.email },
    };
  }

  logEvent("info", "auth.login.ok", { userId: data.user.id });
  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const rawFullName = formData.get("fullName")?.toString().trim() ?? "";
  const rawEmail = formData.get("email")?.toString().trim() ?? "";

  if (!env.REGISTRATION_ENABLED) {
    return {
      error: "Registrasi sedang ditutup. Hubungi admin.",
      errorCode: "signup_disabled",
      values: { fullName: rawFullName, email: rawEmail },
    };
  }

  const parsed = registerSchema.safeParse({
    fullName: rawFullName,
    email: rawEmail,
    password: formData.get("password")?.toString() ?? "",
  });

  if (!parsed.success) {
    const fieldErrors = extractAuthFieldErrors(parsed.error);
    return {
      error: "Ada data yang belum valid. Periksa field yang ditandai di bawah.",
      errorCode: "validation",
      fieldErrors,
      values: { fullName: rawFullName, email: rawEmail },
    };
  }

  const { fullName, email, password } = parsed.data;

  try {
    const admin = createAdminSupabase();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      logEvent("warn", "auth.register.failed", {
        code: createError.code ?? "unknown",
        status: createError.status ?? 0,
      });
      const mapped = mapRegisterAuthError(createError);
      return {
        ...mapped,
        values: { fullName, email },
      };
    }

    logEvent("info", "auth.register.created", { userId: created.user?.id });
  } catch {
    logEvent("error", "auth.register.unavailable");
    return {
      error: "Layanan autentikasi sedang tidak tersedia. Coba lagi beberapa saat.",
      errorCode: "unavailable",
      values: { fullName, email },
    };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    return {
      error: "Akun berhasil dibuat, tetapi gagal masuk otomatis. Silakan masuk manual.",
      errorCode: "unknown",
      values: { fullName, email },
    };
  }

  redirect("/onboarding");
}

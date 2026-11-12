"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { safeNextPath } from "@/lib/safe-redirect";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null };

const loginSchema = z.object({
  email: z.string().trim().email("Masukkan email yang valid."),
  password: z.string().min(1, "Password wajib diisi."),
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120),
  email: z.string().trim().email("Masukkan email yang valid."),
  password: z.string().min(8, "Password minimal 8 karakter."),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Input tidak valid.";
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    logEvent("warn", "auth.login.failed");
    return { error: "Email atau password salah." };
  }

  logEvent("info", "auth.login.ok", { userId: data.user.id });
  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.REGISTRATION_ENABLED) {
    return { error: "Registrasi sedang ditutup. Hubungi admin." };
  }

  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
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
      logEvent("warn", "auth.register.failed", { code: createError.code ?? "unknown" });
      return {
        error:
          createError.code === "email_exists" || createError.status === 422
            ? "Email sudah terdaftar."
            : "Gagal membuat akun. Coba lagi.",
      };
    }

    logEvent("info", "auth.register.created", { userId: created.user?.id });
  } catch {
    logEvent("error", "auth.register.unavailable");
    return { error: "Layanan autentikasi tidak tersedia. Coba lagi." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    return { error: "Akun dibuat, tetapi gagal masuk. Silakan login." };
  }

  redirect("/onboarding");
}

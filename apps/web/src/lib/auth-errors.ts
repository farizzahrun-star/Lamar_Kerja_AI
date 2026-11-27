import { z } from "zod";

export type AuthFieldName = "fullName" | "email" | "password";

export type AuthErrorCode =
  | "validation"
  | "email_exists"
  | "email_invalid"
  | "weak_password"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "signup_disabled"
  | "unavailable"
  | "unknown";

export type AuthState = {
  error: string | null;
  errorCode?: AuthErrorCode;
  fieldErrors?: Partial<Record<AuthFieldName, string>>;
  values?: {
    fullName?: string;
    email?: string;
  };
};

export interface SupabaseAuthErrorLike {
  code?: string | null;
  status?: number | null;
  message?: string | null;
}

export function extractAuthFieldErrors(error: z.ZodError): Partial<Record<AuthFieldName, string>> {
  const fieldErrors: Partial<Record<AuthFieldName, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      (key === "fullName" || key === "email" || key === "password") &&
      !(key in fieldErrors)
    ) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export function mapRegisterAuthError(err: SupabaseAuthErrorLike): Pick<
  AuthState,
  "error" | "errorCode" | "fieldErrors"
> {
  const code = (err.code ?? "").toLowerCase();
  const msg = (err.message ?? "").toLowerCase();
  const status = err.status ?? 0;

  if (
    code === "email_exists" ||
    code === "user_already_exists" ||
    code === "identity_already_exists" ||
    code === "conflict" ||
    status === 409 ||
    msg.includes("already been registered") ||
    msg.includes("already exists") ||
    msg.includes("already registered")
  ) {
    return {
      errorCode: "email_exists",
      error: "Akun dengan email ini sudah terdaftar.",
      fieldErrors: {
        email: "Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.",
      },
    };
  }

  if (
    code === "weak_password" ||
    code === "same_password" ||
    msg.includes("password should be") ||
    msg.includes("weak password") ||
    (status === 422 && msg.includes("password"))
  ) {
    return {
      errorCode: "weak_password",
      error: "Password belum memenuhi syarat keamanan.",
      fieldErrors: {
        password:
          "Password terlalu lemah atau ditolak kebijakan keamanan. Gunakan minimal 8 karakter dengan kombinasi huruf dan angka.",
      },
    };
  }

  if (
    code === "email_address_invalid" ||
    code === "email_address_not_authorized" ||
    msg.includes("unable to validate email") ||
    msg.includes("invalid email") ||
    (code === "validation_failed" && msg.includes("email"))
  ) {
    return {
      errorCode: "email_invalid",
      error: "Alamat email tidak valid atau tidak diizinkan.",
      fieldErrors: {
        email: "Periksa kembali penulisan atau domain email Anda.",
      },
    };
  }

  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    status === 429
  ) {
    return {
      errorCode: "rate_limited",
      error: "Terlalu banyak percobaan pendaftaran. Tunggu sebentar lalu coba lagi.",
    };
  }

  if (code === "signup_disabled" || code === "email_provider_disabled") {
    return {
      errorCode: "signup_disabled",
      error: "Pendaftaran akun baru sedang dinonaktifkan sementara.",
    };
  }

  if (code === "not_admin" || code === "no_authorization" || status === 401 || status === 403) {
    return {
      errorCode: "unavailable",
      error:
        "Konfigurasi layanan autentikasi server belum valid (periksa SUPABASE_SECRET_KEY).",
    };
  }

  if (status === 422) {
    return {
      errorCode: "email_exists",
      error: "Email sudah terdaftar atau data pendaftaran tidak dapat diproses.",
      fieldErrors: {
        email: "Pastikan email belum terdaftar dan formatnya benar.",
      },
    };
  }

  return {
    errorCode: "unknown",
    error: "Gagal membuat akun karena kendala layanan autentikasi. Coba lagi beberapa saat.",
  };
}

export function mapLoginAuthError(err: SupabaseAuthErrorLike): Pick<
  AuthState,
  "error" | "errorCode" | "fieldErrors"
> {
  const code = (err.code ?? "").toLowerCase();
  const msg = (err.message ?? "").toLowerCase();
  const status = err.status ?? 0;

  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return {
      errorCode: "email_not_confirmed",
      error: "Email akun ini belum dikonfirmasi.",
      fieldErrors: {
        email: "Konfirmasi email terlebih dahulu atau hubungi admin.",
      },
    };
  }

  if (code === "user_banned") {
    return {
      errorCode: "unavailable",
      error: "Akun ini sedang dinonaktifkan. Hubungi admin.",
    };
  }

  if (code === "over_request_rate_limit" || status === 429) {
    return {
      errorCode: "rate_limited",
      error: "Terlalu banyak percobaan masuk. Tunggu 1 menit lalu coba lagi.",
    };
  }

  return {
    errorCode: "invalid_credentials",
    error:
      "Email tidak ditemukan atau password salah. Periksa penulisan email dan password Anda.",
    fieldErrors: {
      password: "Pastikan password sesuai (perhatikan huruf besar/kecil).",
    },
  };
}

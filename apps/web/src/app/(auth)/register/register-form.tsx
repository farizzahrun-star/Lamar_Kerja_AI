"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";

import { registerAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

export function RegisterForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, formAction, isPending] = useActionState(registerAction, initialState);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");

  const fullNameError = state.fieldErrors?.fullName;
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;
  const isEmailExists = state.errorCode === "email_exists";

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-serif text-3xl tracking-tight text-ink">Buat akun</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Akun internal. Data Anda tidak dibagikan ke penyedia AI komersial.
        </p>
      </header>

      {state.error ? (
        <div
          role="alert"
          className={[
            "mb-5 rounded-xl border px-4 py-3 text-sm",
            isEmailExists
              ? "border-amber/40 bg-amber/10 text-ink"
              : "border-red-200 bg-red-50 text-red-800",
          ].join(" ")}
        >
          <p className="font-semibold">{state.error}</p>
          {isEmailExists && email ? (
            <p className="mt-1.5 text-xs text-ink-soft">
              Akun dengan email <strong>{email}</strong> sudah ada.{" "}
              <Link
                href={`/login?email=${encodeURIComponent(email)}`}
                className="font-semibold text-accent-deep underline underline-offset-4"
              >
                Masuk dengan email ini →
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <form action={formAction} noValidate className="space-y-5">
        <div>
          <label className="label" htmlFor="fullName">
            Nama lengkap
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            aria-invalid={fullNameError ? true : undefined}
            aria-describedby={fullNameError ? "fullName-error" : undefined}
            className={[
              "field",
              fullNameError ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "",
            ].join(" ")}
            placeholder="Nama sesuai CV"
          />
          {fullNameError ? (
            <p id="fullName-error" className="mt-1.5 text-xs font-medium text-red-700">
              {fullNameError}
            </p>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "email-error" : undefined}
            className={[
              "field",
              emailError ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "",
            ].join(" ")}
            placeholder="nama@email.com"
          />
          {emailError ? (
            <p id="email-error" className="mt-1.5 text-xs font-medium text-red-700">
              {emailError}{" "}
              {isEmailExists && email ? (
                <Link
                  href={`/login?email=${encodeURIComponent(email)}`}
                  className="font-semibold text-accent-deep underline underline-offset-4"
                >
                  Masuk →
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            minLength={8}
            hasError={Boolean(passwordError)}
            describedBy={passwordError ? "password-error" : "password-hint"}
            value={password}
            onChange={setPassword}
          />
          {passwordError ? (
            <p id="password-error" className="mt-1.5 text-xs font-medium text-red-700">
              {passwordError}
            </p>
          ) : (
            <p
              id="password-hint"
              className={[
                "mt-1.5 text-xs",
                password.length >= 8 ? "text-accent-deep" : "text-ink-soft",
              ].join(" ")}
            >
              {password.length >= 8
                ? "✓ Panjang minimal 8 karakter terpenuhi."
                : "Minimal 8 karakter (disarankan kombinasi huruf dan angka)."}
            </p>
          )}
        </div>

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Membuat akun…" : "Daftar"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        Sudah punya akun?{" "}
        <Link
          href={email ? `/login?email=${encodeURIComponent(email)}` : "/login"}
          className="font-semibold text-accent hover:text-accent-deep"
        >
          Masuk
        </Link>
      </p>
    </div>
  );
}

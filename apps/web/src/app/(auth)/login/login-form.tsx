"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";

import { loginAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

export function LoginForm({
  nextPath,
  initialEmail = "",
}: {
  nextPath: string;
  initialEmail?: string;
}) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;
  const isInvalidCredentials = state.errorCode === "invalid_credentials";

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-serif text-3xl tracking-tight text-ink">Masuk</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Lanjutkan melengkapi profil dan menyiapkan lamaran.
        </p>
      </header>

      {state.error ? (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-semibold">{state.error}</p>
          {isInvalidCredentials && email ? (
            <p className="mt-1.5 text-xs text-red-700">
              Belum pernah mendaftar dengan email ini?{" "}
              <Link
                href={`/register?email=${encodeURIComponent(email)}`}
                className="font-semibold underline underline-offset-4"
              >
                Daftar akun baru →
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <form action={formAction} noValidate className="space-y-5">
        <input type="hidden" name="next" value={nextPath} />

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
            aria-invalid={emailError || isInvalidCredentials ? true : undefined}
            aria-describedby={emailError ? "login-email-error" : undefined}
            className={[
              "field",
              emailError || isInvalidCredentials
                ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                : "",
            ].join(" ")}
            placeholder="nama@email.com"
          />
          {emailError ? (
            <p id="login-email-error" className="mt-1.5 text-xs font-medium text-red-700">
              {emailError}
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
            autoComplete="current-password"
            placeholder="••••••••"
            hasError={Boolean(passwordError)}
            describedBy={passwordError ? "login-password-error" : undefined}
            value={password}
            onChange={setPassword}
          />
          {passwordError ? (
            <p id="login-password-error" className="mt-1.5 text-xs font-medium text-red-700">
              {passwordError}
            </p>
          ) : null}
        </div>

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Memeriksa…" : "Masuk"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        Belum punya akun?{" "}
        <Link
          href={email ? `/register?email=${encodeURIComponent(email)}` : "/register"}
          className="font-semibold text-accent hover:text-accent-deep"
        >
          Daftar
        </Link>
      </p>
    </div>
  );
}

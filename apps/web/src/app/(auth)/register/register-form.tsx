"use client";

import Link from "next/link";
import { useActionState } from "react";

import { registerAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState);

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-serif text-3xl tracking-tight text-ink">Buat akun</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Akun internal. Data Anda tidak dibagikan ke penyedia AI komersial.
        </p>
      </header>

      {state.error ? (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="space-y-5">
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
            className="field"
            placeholder="Nama sesuai CV"
          />
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
            className="field"
            placeholder="nama@email.com"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="field"
            placeholder="Minimal 8 karakter"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Membuat akun…" : "Daftar"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold text-accent hover:text-accent-deep">
          Masuk
        </Link>
      </p>
    </div>
  );
}

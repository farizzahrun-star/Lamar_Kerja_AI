"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-serif text-3xl tracking-tight text-ink">Masuk</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Lanjutkan melengkapi profil dan menyiapkan lamaran.
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
            autoComplete="current-password"
            required
            className="field"
            placeholder="••••••••"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Memeriksa…" : "Masuk"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        Belum punya akun?{" "}
        <Link href="/register" className="font-semibold text-accent hover:text-accent-deep">
          Daftar
        </Link>
      </p>
    </div>
  );
}

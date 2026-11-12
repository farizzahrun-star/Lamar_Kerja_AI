"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Jangan log isi error mentah jika berpotensi memuat PII.
    console.error("Unhandled app error", error.digest ?? "no-digest");
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center">
        <h1 className="font-serif text-2xl tracking-tight text-ink">Terjadi kesalahan</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Silakan coba lagi. Jika berulang, hubungi admin dengan kode error di bawah.
        </p>
        {error.digest ? (
          <p className="mt-4 rounded-lg bg-paper px-3 py-2 font-mono text-xs text-ink-soft">
            {error.digest}
          </p>
        ) : null}
        <button type="button" onClick={reset} className="btn-primary mt-6">
          Coba lagi
        </button>
      </div>
    </div>
  );
}

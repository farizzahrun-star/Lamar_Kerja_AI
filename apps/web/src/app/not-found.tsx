import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">404</p>
        <h1 className="mt-2 font-serif text-2xl tracking-tight text-ink">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Tautan mungkin sudah berubah atau Anda tidak memiliki akses.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6">
          Kembali ke dashboard
        </Link>
      </div>
    </div>
  );
}

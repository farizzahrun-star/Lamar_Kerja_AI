import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profil" };

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">Profil</p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Data diri</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Halaman ini akan menampilkan ringkasan profil dan editor per bagian pada milestone M1.
      </p>
    </div>
  );
}

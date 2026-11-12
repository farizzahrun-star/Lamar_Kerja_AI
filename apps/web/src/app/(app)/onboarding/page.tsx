import type { Metadata } from "next";

export const metadata: Metadata = { title: "Onboarding" };

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">Onboarding</p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Lengkapi profil</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Wizard onboarding akan tersedia pada milestone M1: identitas, pendidikan, pengalaman,
        skill, sertifikasi, dan bahasa — dengan autosave per bagian.
      </p>
    </div>
  );
}

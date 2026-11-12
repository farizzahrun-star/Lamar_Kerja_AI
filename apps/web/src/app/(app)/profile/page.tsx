import type { Metadata } from "next";
import Link from "next/link";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { requireUser } from "@/lib/auth";
import { loadProfileBundle } from "@/lib/profile-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const bundle = await loadProfileBundle(supabase, user.id);

  const completed = Boolean(bundle.profile.onboarding_completed_at);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">Profil</p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Data diri</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Data ini menjadi sumber tunggal untuk semua CV yang dirender dan draf surat lamaran.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              completed ? "bg-accent-soft text-accent-deep" : "bg-amber/10 text-amber"
            }`}
          >
            {completed ? "Onboarding selesai" : "Onboarding belum selesai"}
          </span>
          {!completed ? (
            <Link href="/onboarding" className="btn-secondary">
              Lanjutkan wizard
            </Link>
          ) : null}
        </div>
      </header>

      <ProfileEditor initialBundle={bundle} mode="full" />
    </div>
  );
}

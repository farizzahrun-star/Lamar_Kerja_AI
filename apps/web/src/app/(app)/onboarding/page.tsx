import type { Metadata } from "next";
import Link from "next/link";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { requireUser } from "@/lib/auth";
import { loadProfileBundle } from "@/lib/profile-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Onboarding" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const bundle = await loadProfileBundle(supabase, user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
            Onboarding
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Lengkapi profil</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Isi langkah demi langkah. Identitas tersimpan otomatis saat Anda mengetik; bagian lain
            tersimpan setiap kali Anda menambah atau mengubah entri.
          </p>
        </div>

        <Link href="/profile" className="btn-ghost">
          Buka tampilan lengkap →
        </Link>
      </header>

      <ProfileEditor initialBundle={bundle} mode="wizard" />
    </div>
  );
}

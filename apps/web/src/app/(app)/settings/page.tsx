import type { Metadata } from "next";
import Link from "next/link";

import { PreferencesForm } from "@/components/settings/preferences-form";
import { requireUser } from "@/lib/auth";
import { loadUserPreferences } from "@/lib/preferences/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preferensi" };

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const initialData = await loadUserPreferences(supabase, user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
            Preferensi
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">
            Minat & platform
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Atur role yang Anda incar, platform sumber lowongan, dan batas antrean harian.
          </p>
        </div>

        <Link href="/jobs" className="btn-secondary">
          Lihat lowongan cocok →
        </Link>
      </header>

      <PreferencesForm initialData={initialData} />
    </div>
  );
}

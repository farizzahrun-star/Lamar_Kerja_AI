import type { Metadata } from "next";
import Link from "next/link";

import { ApplicationsList } from "@/components/applications/applications-list";
import { requireUser } from "@/lib/auth";
import { loadUserApplications } from "@/lib/applications/service";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Antrean Lamaran" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const overview = await loadUserApplications(supabase, user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
            Antrean Apply
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Antrean & status</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Pantau seluruh lowongan yang sudah Anda antrekan. Selama berstatus{" "}
            <strong>Diantrekan</strong>, Anda masih dapat membatalkannya kapan saja.
          </p>
        </div>

        <Link href="/jobs" className="btn-secondary">
          Pilih lowongan lagi →
        </Link>
      </header>

      <ApplicationsList initialData={overview} />
    </div>
  );
}

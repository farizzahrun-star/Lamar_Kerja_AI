import type { Metadata } from "next";
import Link from "next/link";

import { JobsBoard } from "@/components/jobs/jobs-board";
import { requireUser } from "@/lib/auth";
import { loadJobsFeed } from "@/lib/jobs/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lowongan" };

export default async function JobsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const initialData = await loadJobsFeed(supabase, user.id, { snapshot: "h1" });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
            Tahap 2 · Pemilihan
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Lowongan hari ini</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Tinjau lowongan dari snapshot H-1, periksa channel pengiriman, lalu centang lowongan
            yang ingin Anda masukkan ke antrean lamaran.
          </p>
        </div>

        <Link href="/settings" className="btn-secondary">
          Atur minat & platform →
        </Link>
      </header>

      <JobsBoard initialData={initialData} />
    </div>
  );
}
